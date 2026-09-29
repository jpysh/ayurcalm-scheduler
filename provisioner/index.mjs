// Trial sign-up (#247): signup.jains.es. A visitor gives a centre name and an
// email; the emailed link creates the centre at <slug>.jains.es and signs them
// into its setup wizard. Hourly, each centre moves through lifecycle.mjs.
// Runs on the trial host next to Docker (hosting/centre.sh). No dependencies.
//   node provisioner/index.mjs          (PORT 8200; env below)
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, appendFileSync, existsSync } from 'node:fs';
import { next, refuse, slugFor } from './lifecycle.mjs';

const run = promisify(execFile);
const ROOT = new URL('..', import.meta.url).pathname;
const DATA = process.env.RUTA_DATA || `${process.env.HOME}/ruta-data`;
const DOMAIN = process.env.RUTA_DOMAIN || 'jains.es';
const SELF = `https://signup.${DOMAIN}`;
const env = process.env;
const DB = `${DATA}/provisioner.json`;

// ---- state: one JSON file, written whole (a few dozen centres at most) ----
const db = existsSync(DB) ? JSON.parse(readFileSync(DB, 'utf8')) : { signups: [], centres: [], waitlist: [] };
const save = () => { writeFileSync(`${DB}.tmp`, JSON.stringify(db, null, 1)); renameSync(`${DB}.tmp`, DB); };

// ---- outside world ----
async function email(to, subject, text) {
  if (env.CF_EMAIL_TOKEN) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.CF_EMAIL_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, from: { address: `hello@${DOMAIN}`, name: 'Ruta' }, subject, text }),
    });
    if (!r.ok) throw new Error(`email ${r.status}`);
  } else console.log(`[email to ${to}] ${subject}\n${text}\n`); // until an email provider is set up
}
async function telegram(text) {
  if (env.TELEGRAM_BOT_TOKEN) await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  }).catch(() => {});
  else console.log(`[telegram] ${text}`);
}
async function human(token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // local runs only
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token || '', remoteip: ip }),
  }).then((x) => x.json()).catch(() => ({}));
  return r.success === true;
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function signinLink(slug, to) {
  const secret = readFileSync(`${DATA}/${slug}/env`, 'utf8').match(/^JWT_SECRET=(.+)$/m)[1];
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ purpose: 'signin', email: to, jti: randomBytes(9).toString('hex'), iat: now, exp: now + 1800 })}`;
  return `https://${slug}.${DOMAIN}/login#link=${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

// The tunnel's config lists one address per centre; the tunnel restarts to read it.
// ponytail: a restart drops every centre's connections for ~2 s; remotely-managed tunnel config if that bites.
const TUNNEL = `${DATA}/tunnel.yml`;
async function route(slug, port) {
  const y = readFileSync(TUNNEL, 'utf8');
  const line = `  - hostname: ${slug}.${DOMAIN}\n    service: http://host.docker.internal:${port}\n`;
  if (port && !y.includes(`${slug}.${DOMAIN}`)) writeFileSync(TUNNEL, y.replace('  - service: http_status:404', `${line}  - service: http_status:404`));
  if (!port) writeFileSync(TUNNEL, y.replace(new RegExp(`  - hostname: ${slug}\\.${DOMAIN.replace('.', '\\.')}\\n.*\\n`), ''));
  // ponytail: a deleted centre's DNS record stays, pointing at the tunnel's 404; the scoped API token (#247) can remove it.
  if (port) await run('cloudflared', ['--config', TUNNEL, 'tunnel', 'route', 'dns', '--overwrite-dns', 'ruta', `${slug}.${DOMAIN}`]);
  await run('docker', ['compose', '-f', `${ROOT}hosting/compose.yml`, '-p', 'ruta-host', 'restart', 'tunnel']);
}
const centreSh = (extra, ...a) => run('sh', [`${ROOT}hosting/centre.sh`, ...a], { env: { ...env, RUTA_DATA: DATA, TRIAL: 'true', ...extra }, maxBuffer: 1 << 26 });

// ---- provisioning, one at a time ----
let queue = Promise.resolve();
function provision(s) {
  s.state = 'queued'; save();
  queue = queue.then(async () => {
    try {
      s.state = 'building'; save();
      const slug = slugFor(s.centre, [...db.centres.map((c) => c.slug), 'shots', 'host']);
      const port = Math.max(8299, ...db.centres.map((c) => c.port)) + 1;
      await centreSh({ ADMIN_EMAIL: s.email }, 'up', slug, String(port));
      for (let i = 0; i < 100 && !(await fetch(`http://localhost:${port}/api/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 3000));
      await route(slug, port);
      db.centres.push({ slug, port, email: s.email, centre: s.centre, ref: s.ref, created: Date.now(), warned: {}, key: randomBytes(18).toString('base64url') });
      s.state = 'ready'; s.slug = slug; s.used = true; save();
      await telegram(`New trial centre: ${s.centre} (${slug}.${DOMAIN}) by ${s.email}${s.ref ? `, invited by ${s.ref}` : ''}`);
    } catch (e) {
      console.error('provision failed', e); s.state = 'failed'; save();
      await telegram(`Provisioning FAILED for ${s.centre} (${s.email}): ${e.message}`);
    }
  });
}

// ---- lifecycle, hourly ----
const say = {
  pause: (c) => [`${c.centre} is paused`, `Nobody has used ${c.slug}.${DOMAIN} for three days, so we paused it. Open this link within 14 days to switch it back on:\n${SELF}/restore?c=${c.slug}&k=${c.key}`],
  p7: (c) => [`${c.centre} will be deleted in 7 days`, `Your paused trial centre is deleted in 7 days. Switch it back on:\n${SELF}/restore?c=${c.slug}&k=${c.key}`],
  p1: (c) => [`${c.centre} will be deleted tomorrow`, `Your paused trial centre is deleted tomorrow. Switch it back on:\n${SELF}/restore?c=${c.slug}&k=${c.key}`],
  t7: (c) => [`7 days left on your ${c.centre} trial`, `Your free trial ends in 7 days. Nothing is deleted then: the centre becomes read-only and "Download everything" in Settings keeps working. Reply to choose Cloud + support or On-premise + support.`],
  ended: (c) => [`Your ${c.centre} trial has ended`, `Your data is safe and read-only for 60 days. Download everything from Settings to run it yourself for free, or reply to choose Cloud + support (₹1,499/month) or On-premise + support (₹999/month).`],
  e7: (c) => [`${c.centre} will be deleted in 7 days`, `Your ended trial is deleted in 7 days. Download everything from Settings first if you want to keep it.`],
  e1: (c) => [`${c.centre} will be deleted tomorrow`, `Your ended trial is deleted tomorrow. Download everything from Settings first if you want to keep it.`],
};
export async function tick(now = Date.now()) {
  for (const c of [...db.centres]) {
    if (!c.paused_at) c.trial = await fetch(`http://localhost:${c.port}/api/public/support`).then((r) => r.json()).then((d) => d.trial, () => c.trial);
    const a = next(c, now);
    if (!a) continue;
    try {
      if (a.do === 'pause') { await centreSh({}, 'stop', c.slug); c.paused_at = now; await email(c.email, ...say.pause(c)); }
      if (a.do === 'warn') { await email(c.email, ...say[a.key](c)); c.warned[a.key] = true; }
      if (a.do === 'delete') {
        await centreSh({}, 'delete', c.slug); await route(c.slug, 0);
        db.centres = db.centres.filter((x) => x !== c);
        await telegram(`Deleted ${c.slug} (${a.why})`);
      }
    } catch (e) { console.error(`lifecycle ${c.slug}`, e); }
    save();
  }
}

// ---- HTTP ----
const page = (body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ruta: start a free trial</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:26rem;margin:2rem auto;padding:0 1rem;color:#1c2b22;background:#f3f6f3}label{display:block;margin:.8rem 0 .2rem}input{width:100%;box-sizing:border-box;padding:.7rem;border:1px solid #8a9a8f;border-radius:.6rem;font:inherit}button{margin-top:1rem;width:100%;padding:.8rem;border:0;border-radius:.6rem;background:#3d6b50;color:#fff;font:inherit;font-weight:600}a{color:#3d6b50}</style>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>${body}</html>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const form = (msg = '', ref = '') => page(`<h1>Start a free 30-day trial</h1><p>Your own centre at <b>yourname.${DOMAIN}</b>, ready in about two minutes. No card. Want to look first? <a href="https://demo.${DOMAIN}">See the demo</a>.</p>
${msg && `<p role="alert"><b>${esc(msg)}</b></p>`}<form method="post" action="/signup">${/^[a-z0-9-]{1,40}$/.test(ref || '') ? `<input type="hidden" name="ref" value="${ref}">` : ''}<label for="c">Centre name</label><input id="c" name="centre" required maxlength="80" autocomplete="organization">
<label for="e">Your email</label><input id="e" name="email" type="email" required maxlength="120" autocomplete="email">
${env.TURNSTILE_SITEKEY ? `<div class="cf-turnstile" data-sitekey="${env.TURNSTILE_SITEKEY}" style="margin-top:1rem"></div>` : ''}<button>Email me the link</button></form>
<h2 style="font-size:1rem;margin-top:2rem">Already have a centre?</h2><form method="post" action="/again"><label for="a">Your email</label><input id="a" name="email" type="email" required autocomplete="email"><button>Email me a sign-in link</button></form>`);

const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (d) => { if ((b += d).length > 4096) req.destroy(); }); req.on('end', () => ok(new URLSearchParams(b))); });
const send = (res, code, html, headers = {}) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', ...headers }); res.end(html); };

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, SELF);
  const ip = (env.BEHIND_CLOUDFLARE === 'true' && req.headers['cf-connecting-ip']) || req.socket.remoteAddress;
  try {
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, form('', url.searchParams.get('ref')));
    // The landing page's "N of 10 founding places left" (#245). Founding centres not hosted here: FOUNDING_ELSEWHERE.
    if (url.pathname === '/founding') {
      const taken = db.centres.filter((c) => c.trial?.plan === 'founding').length + Number(env.FOUNDING_ELSEWHERE || 0);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' });
      return res.end(JSON.stringify({ left: Math.max(0, 10 - taken) }));
    }
    if (req.method === 'POST' && url.pathname === '/signup') {
      const f = await body(req);
      const centre = (f.get('centre') || '').trim().slice(0, 80), to = (f.get('email') || '').trim().toLowerCase();
      if (!centre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return send(res, 400, form('Please give a centre name and a working email.'));
      if (!(await human(f.get('cf-turnstile-response'), ip))) return send(res, 400, form('Please tick the check box and try again.'));
      const no = refuse(db.signups, db.centres, { ip, email: to }, Date.now());
      if (no === 'waitlist') {
        db.waitlist.push({ centre, email: to, at: Date.now() }); save();
        await telegram(`Waitlist: ${centre} (${to}). ${db.centres.length} centres live.`);
        return send(res, 200, page(`<h1>You're on the list</h1><p>All our trial places are full right now. We will email ${esc(to)} as soon as one opens.</p>`));
      }
      if (no) return send(res, 429, form(no));
      const ref = /^[a-z0-9-]{1,40}$/.test(f.get('ref') || '') ? f.get('ref') : undefined;
      const s = { centre, email: to, ip, ref, at: Date.now(), key: randomBytes(18).toString('base64url') };
      db.signups.push(s); save();
      await email(to, `Your Ruta link for ${centre}`, `Open this link to create ${centre}. It signs you straight in.\n\n${SELF}/go?k=${s.key}\n\nIf you did not ask for this, ignore this email.`);
      return send(res, 200, page(`<h1>Check your email</h1><p>We sent a link to <b>${esc(to)}</b>. Open it on this phone or computer to create ${esc(centre)}.</p>`));
    }
    if (req.method === 'POST' && url.pathname === '/again') {
      const to = ((await body(req)).get('email') || '').trim().toLowerCase();
      const c = db.centres.find((x) => x.email === to && !x.paused_at);
      if (c) await email(to, `Sign in to ${c.centre}`, `This link signs you in to ${c.slug}.${DOMAIN}. It works once, within 30 minutes.\n\n${signinLink(c.slug, to)}`);
      return send(res, 200, page(`<h1>Check your email</h1><p>If ${esc(to)} has a trial centre, a sign-in link is on its way.</p>`));
    }
    const s = db.signups.find((x) => x.key && x.key === url.searchParams.get('k'));
    if (url.pathname === '/go' && s) {
      if (!s.state) provision(s);
      return send(res, 200, page(`<h1>Creating ${esc(s.centre)}…</h1><p id="m">This takes about two minutes. Keep this page open.</p><progress style="width:100%"></progress>
<script>(async function poll(){const r=await fetch('/status?k=${esc(s.key)}').then(r=>r.json()).catch(()=>({}));if(r.go)return location.replace(r.go);if(r.failed){document.getElementById('m').textContent='Something went wrong. We have been told and will email you.';return}setTimeout(poll,3000)})()</script>`));
    }
    if (url.pathname === '/status' && s) {
      // The sign-in is handed over once; after that the admin asks for a fresh link by email.
      const go = s.state === 'ready' && !s.handed ? signinLink(s.slug, s.email) : null;
      if (go) { s.handed = true; save(); }
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ state: s.state, go, failed: s.state === 'failed' }));
    }
    const c = db.centres.find((x) => x.slug === url.searchParams.get('c'));
    if (url.pathname === '/restore' && c && c.key && url.searchParams.get('k') === c.key) {
      if (c.paused_at) { await centreSh({}, 'start', c.slug); c.paused_at = null; c.created = Date.now(); c.warned = {}; save(); }
      return send(res, 302, '', { Location: `https://${c.slug}.${DOMAIN}/login` });
    }
    send(res, 404, page('<h1>This link is not valid</h1><p><a href="/">Start again</a></p>'));
  } catch (e) { console.error(e); send(res, 500, page('<h1>Something went wrong</h1><p>Please try again in a minute.</p>')); }
});

if (process.argv[1] === new URL(import.meta.url).pathname) {
  server.listen(Number(env.PORT || 8200), () => console.log(`provisioner on :${env.PORT || 8200}`));
  setInterval(() => tick().catch(console.error), 3_600_000);
}
