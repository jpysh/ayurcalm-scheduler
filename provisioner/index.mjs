// Trial sign-up (#247): signup.jains.es. A visitor gives a centre name and an
// email; the centre is created at <slug>.jains.es and an "Open your centre" link
// on screen signs them in, where they choose a password. Nothing waits on the
// email (#727): seeing their centre comes first; the email only says where it is.
// Hourly, each centre moves through lifecycle.mjs; nothing about that is emailed.
// Runs on the trial host next to Docker (hosting/centre.sh). No dependencies.
//   node provisioner/index.mjs          (PORT 8200; env below)
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, appendFileSync, existsSync } from 'node:fs';
import { next, deletesAt, refuse, slugFor, linkOpen, took, rollout } from './lifecycle.mjs';
import { morning } from './morning.mjs';

const run = promisify(execFile);
const ROOT = new URL('..', import.meta.url).pathname;
const DATA = process.env.RUTA_DATA || `${process.env.HOME}/ruta-data`;
const DOMAIN = process.env.RUTA_DOMAIN || 'jains.es';
const SELF = `https://signup.${DOMAIN}`;
const env = process.env;
const DB = `${DATA}/provisioner.json`;

// ---- state: one JSON file, written whole (a few dozen centres at most) ----
const db = { feedback: [], ...(existsSync(DB) ? JSON.parse(readFileSync(DB, 'utf8')) : { signups: [], centres: [], waitlist: [] }) };
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

// The tunnel's config lists one address per centre: its own port, or this
// service while it is paused, so its address can switch it back on (#247).
// ponytail: a restart drops every centre's connections for ~2 s; remotely-managed tunnel config if that bites.
const TUNNEL = `${DATA}/tunnel.yml`;
const svc = (port) => `http://host.docker.internal:${port}`;
const PAUSED = svc(env.PORT || 8200);
async function route(slug, service) {
  if (!existsSync(TUNNEL)) return; // a local run has no tunnel
  const host = `${slug}.${DOMAIN}`;
  const y = readFileSync(TUNNEL, 'utf8').replace(new RegExp(`  - hostname: ${host.replaceAll('.', '\\.')}\\n.*\\n`), '');
  writeFileSync(TUNNEL, service ? y.replace('  - service: http_status:404', `  - hostname: ${host}\n    service: ${service}\n  - service: http_status:404`) : y);
  // ponytail: a deleted centre's DNS record stays, pointing at the tunnel's 404; the scoped API token (#247) can remove it.
  if (service) await run('cloudflared', ['--config', TUNNEL, 'tunnel', 'route', 'dns', '--overwrite-dns', 'ruta', host]);
  await run('docker', ['compose', '-f', `${ROOT}hosting/compose.yml`, '-p', 'ruta-host', 'restart', 'tunnel']);
}
const up = async (port) => { for (let i = 0; i < 100 && !(await fetch(`http://localhost:${port}/api/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 3000)); };
const centreSh = (extra, ...a) => run('sh', [`${ROOT}hosting/centre.sh`, ...a], { env: { ...env, RUTA_DATA: DATA, TRIAL: 'true', ...extra }, maxBuffer: 1 << 26 });

// ---- provisioning, one at a time ----
let queue = Promise.resolve();
function provision(s) {
  s.state = 'queued'; save();
  queue = queue.then(async () => {
    try {
      s.state = 'building'; save();
      const slug = slugFor(s.centre, [...db.centres.map((c) => c.slug), 'shots', 'host']);
      const port = Math.max(Number(env.CENTRE_PORT_FROM || 8300) - 1, ...db.centres.map((c) => c.port)) + 1;
      await centreSh({ ADMIN_EMAIL: s.email, CENTRE_NAME: s.centre }, 'up', slug, String(port));
      await up(port);
      await route(slug, svc(port));
      db.centres.push({ slug, port, email: s.email, centre: s.centre, ref: s.ref, created: Date.now(), signed_up: s.at });
      s.state = 'ready'; s.ready_at = Date.now(); s.slug = slug; s.used = true; save();
      if (env.CF_EMAIL_TOKEN) await email(s.email, `${s.centre} is ready`, `Your centre is at https://${slug}.${DOMAIN}\n\nTo sign in on another phone, open ${SELF} and ask for a sign-in link.\n\nIf you did not ask for this, reply and we will delete it.`).catch((e) => console.error('ready email', e));
      await telegram(`New trial centre: ${s.centre} (${slug}.${DOMAIN}) by ${s.email}${s.ref ? `, invited by ${s.ref}` : ''}`);
    } catch (e) {
      console.error('provision failed', e); s.state = 'failed'; save();
      await telegram(`Provisioning FAILED for ${s.centre} (${s.email}): ${e.message}`);
    }
  });
}

// How long each trial took to come in and to print its own day sheet (#730), told once each.
async function timings(c) {
  const [signin, sheet] = await centreSh({}, 'timings', c.slug).then((r) => r.stdout.trim().split('|').map((x) => (x ? Number(x) * 1000 : null)), () => []);
  const from = db.signups.find((s) => s.slug === c.slug)?.at ?? c.created;
  if (signin && !c.signin_at) { c.signin_at = signin; await telegram(`${c.centre}: came in ${took(signin - from)} after signing up`); }
  if (sheet && !c.sheet_at) { c.sheet_at = sheet; await telegram(`${c.centre}: printed its own day sheet ${took(sheet - from)} after signing up`); }
  save();
}

// ---- lifecycle, hourly ----
export async function tick(now = Date.now()) {
  for (const c of [...db.centres]) {
    if (!c.paused_at) c.trial = await fetch(`http://localhost:${c.port}/api/public/support`).then((r) => r.json()).then((d) => d.trial, () => c.trial);
    if (!c.paused_at && !c.sheet_at) await timings(c);
    const a = next(c, now);
    if (!a) continue;
    try {
      if (a.do === 'pause') { await centreSh({}, 'stop', c.slug); c.paused_at = now; await route(c.slug, PAUSED); }
      if (a.do === 'delete') {
        await centreSh({}, 'delete', c.slug); await route(c.slug, null);
        db.centres = db.centres.filter((x) => x !== c);
        await telegram(`Deleted ${c.slug} (${a.why})`);
      }
    } catch (e) { console.error(`lifecycle ${c.slug}`, e); }
    save();
  }
}

// ---- update (#904): a new main is tested on a throwaway centre, then rolled out. Once a day, in the
// 21:00 hour in India, after treatments (#920): one restart a night, not one per merge.
// LIVE_CENTRES in provisioner.env lists the centres with real use, e.g. "babaji:8202".
const LIVE = (env.LIVE_CENTRES || '').split(/\s+/).filter(Boolean).map((x) => ({ slug: x.split(':')[0], port: Number(x.split(':')[1]) }));
const git = (...a) => run('git', ['-C', ROOT, ...a]).then((r) => r.stdout.trim());
let updating = false;
const indiaHour = (now = new Date()) => Number(now.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
export async function update() {
  if (updating || indiaHour() !== 21) return;
  updating = true;
  const gate = `${DATA}/gate`;
  try {
    await git('fetch', '-q', 'origin', 'main');
    const sha = await git('rev-parse', 'origin/main');
    if (sha === (await git('rev-parse', 'HEAD')) || sha === db.update?.failed_sha) return;
    const short = sha.slice(0, 7);
    // The tests write far more than a centre's limits allow, so they run on their own fresh copy, never on the demo.
    await run('git', ['-C', ROOT, 'worktree', 'add', '-f', '--detach', gate, sha]);
    const qa = await run('sh', [`${gate}/scripts/qa.sh`], { env: { ...env, COMPOSE_PROJECT_NAME: 'ruta-gate', APP_PORT: '8199' }, maxBuffer: 1 << 26 }).then(() => null, (e) => (e.stdout || '').split('\n').find((l) => l.includes('FAIL'))?.trim() || 'qa did not finish');
    await run('docker', ['compose', '-p', 'ruta-gate', 'down', '-v'], { cwd: gate }).catch(() => {});
    let r = { failed: qa ? 'tests' : null, why: qa };
    if (!qa) {
      await git('merge', '-q', '--ff-only', sha);
      const sites = [{ slug: 'demo', port: 8201 }, ...LIVE, ...db.centres.filter((c) => !c.paused_at)];
      r = await rollout(sites, async (c) => { await centreSh({}, 'backup', c.slug); await centreSh({}, 'up', c.slug, String(c.port)); await up(c.port); if (!(await fetch(`http://localhost:${c.port}/api/health`).then((x) => x.ok, () => false))) throw new Error('did not come up'); });
    }
    db.update = { sha: short, at: Date.now(), failed: r.failed, why: r.why, failed_sha: r.failed ? sha : null }; save();
    await telegram(r.failed ? `ALERT: update ${short} stopped at ${r.failed}: ${r.why}` : `Updated to ${short}: demo, live centres and trials`);
    if (!r.failed) process.exit(0); // launchd starts the service again on the new code
  } catch (e) { console.error('update', e); }
  finally { await run('git', ['-C', ROOT, 'worktree', 'remove', '-f', gate]).catch(() => {}); updating = false; }
}

// ---- tidy, nightly (#920): every update rebuilds every centre, and the build cache grew past 100 GB.
// Only what nothing uses: cache and images over a week old, and this repo's throwaway stacks (a session's
// check, a qa copy) left up a day, which are stopped with their data kept. Centres, the host and the
// local copy are never touched.
const KEEP = /^(ruta-.*|ayurcalm-scheduler)$/;
export const stale = (rows, now) => [...new Set(rows.filter((r) => !KEEP.test(r.project) && /ayurcalm-scheduler/.test(r.dir) && now - Date.parse(r.created) > 24 * 3_600_000).map((r) => r.project))];
export async function tidy(now = Date.now()) {
  const before = await run('df', ['-P', DATA]).then((r) => r.stdout.trim().split('\n')[1].split(/\s+/)[4], () => '?');
  await run('docker', ['builder', 'prune', '-f', '--filter', 'until=168h']).catch(console.error);
  await run('docker', ['image', 'prune', '-af', '--filter', 'until=168h']).catch(console.error);
  const ps = await run('docker', ['ps', '--format', '{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.working_dir"}}\t{{.CreatedAt}}']).then((r) => r.stdout.trim().split('\n').filter(Boolean), () => []);
  const rows = ps.map((l) => { const [project, dir, at] = l.split('\t'); return { project, dir, created: at.split(' ').slice(0, 3).join(' ').replace(' ', 'T').replace(' ', '') }; });
  const stopped = stale(rows, now);
  for (const p of stopped) await run('docker', ['compose', '-p', p, 'stop']).catch(console.error);
  const after = await run('df', ['-P', DATA]).then((r) => r.stdout.trim().split('\n')[1].split(/\s+/)[4], () => '?');
  db.tidy = { at: now, before, after, stopped }; save();
}

// ---- watch, hourly (#248): the demo and every centre up, a backup in the last 26 h, disk not full.
// Each problem is told once on Telegram, and once more when it clears. All clear pings HEALTHCHECKS_URL,
// so a silent host (provisioner or Mac down) raises Healthchecks.io's own alarm.
const open = new Set();
let latest = [];
export async function watch(now = Date.now()) {
  const problems = [];
  const sites = [{ slug: 'demo', port: 8201 }, ...LIVE, ...db.centres.filter((c) => !c.paused_at)];
  for (const c of sites) {
    if (!(await fetch(`http://localhost:${c.port}/api/health`).then((r) => r.ok, () => false))) problems.push(`${c.slug}.${DOMAIN} is down`);
    const newest = await run('sh', ['-c', `ls -1t "${DATA}/${c.slug}/backups"/ayurcalm-*.sql.gz 2>/dev/null | head -1`]).then((r) => r.stdout.trim(), () => '');
    const age = newest ? now - (await import('node:fs')).statSync(newest).mtimeMs : Infinity;
    if (age > 26 * 3_600_000 && now - (c.created || 0) > 26 * 3_600_000) problems.push(`${c.slug}: no backup in 26 hours`);
  }
  const used = await run('df', ['-P', DATA]).then((r) => Number(r.stdout.trim().split('\n')[1].split(/\s+/)[4].replace('%', '')), () => 0);
  if (used >= 85) problems.push(`disk ${used}% full`);
  for (const p of problems) if (!open.has(p)) { open.add(p); await telegram(`ALERT: ${p}`); }
  for (const p of [...open]) if (!problems.includes(p)) { open.delete(p); await telegram(`Cleared: ${p}`); }
  if (!problems.length && env.HEALTHCHECKS_URL) await fetch(env.HEALTHCHECKS_URL).catch(() => {});
  latest = problems;
  return problems;
}

// ---- HTTP ----
const page = (body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ruta: start a free trial</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:26rem;margin:2rem auto;padding:0 1rem;color:#1c2b22;background:#f3f6f3}label{display:block;margin:.8rem 0 .2rem}input{width:100%;box-sizing:border-box;padding:.7rem;border:1px solid #8a9a8f;border-radius:.6rem;font:inherit}button{margin-top:1rem;width:100%;padding:.8rem;border:0;border-radius:.6rem;background:#3d6b50;color:#fff;font:inherit;font-weight:600}a{color:#3d6b50}</style>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>${body}</html>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const form = (msg = '', ref = '') => page(`<h1>Start a free 30-day trial</h1><p>Your own centre at <b>yourname.${DOMAIN}</b>, ready in about two minutes. No card. Want to look first? <a href="https://demo.${DOMAIN}">See the demo</a>.</p>
${msg && `<p role="alert"><b>${esc(msg)}</b></p>`}<form method="post" action="/signup">${/^[a-z0-9-]{1,40}$/.test(ref || '') ? `<input type="hidden" name="ref" value="${ref}">` : ''}<label for="c">Centre name</label><input id="c" name="centre" required maxlength="80" autocomplete="organization">
<label for="e">Your email</label><input id="e" name="email" type="email" required maxlength="120" autocomplete="email">
${env.TURNSTILE_SITEKEY ? `<div class="cf-turnstile" data-sitekey="${env.TURNSTILE_SITEKEY}" style="margin-top:1rem"></div>` : ''}<button>Create my centre</button></form>
${env.CF_EMAIL_TOKEN ? `<h2 style="font-size:1rem;margin-top:2rem">Already have a centre?</h2><form method="post" action="/again"><label for="a">Your email</label><input id="a" name="email" type="email" required autocomplete="email"><button>Email me a sign-in link</button></form>` : ''}
<p style="font-size:.85rem;margin-top:2rem">By starting a trial you accept the <a href="https://jains.es/ruta/pilot">pilot notice</a>. Questions: <a href="https://wa.me/420777558262">WhatsApp</a> · <a href="mailto:helloayursen@gmail.com">helloayursen@gmail.com</a></p>`);

const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
async function wake(req, res, c) {
  const login = `https://${c.slug}.${DOMAIN}/login`;
  const opening = page(`<meta http-equiv="refresh" content="8;url=${login}"><h1>${esc(c.centre)} is back on</h1><p>Opening it in a few seconds. <a href="${login}">Open it now</a></p>`);
  if (!c.paused_at) return send(res, 200, opening); // switched on a moment ago; the tunnel is catching up
  if (req.method !== 'POST') return send(res, 200, page(`<h1>${esc(c.centre)} is switched off</h1><p>Nobody used it for three days, so we switched it off to save space. Everything in it is kept until <b>${day(deletesAt(c))}</b>.</p>${c.trial?.started_at ? '' : `<p>Only wanted a look around? <a href="https://demo.${DOMAIN}">The demo</a> is always on.</p>`}
<form method="post"><button>Switch it back on</button></form><p style="font-size:.85rem;margin-top:2rem">Questions: <a href="https://wa.me/420777558262">WhatsApp</a></p>`));
  if (!c.waking) {
    c.waking = (async () => {
      await centreSh({}, 'start', c.slug); await up(c.port); await route(c.slug, svc(c.port));
      c.paused_at = null; c.created = Date.now(); save();
      await telegram(`Switched back on: ${c.slug}`);
    })().finally(() => { delete c.waking; });
  }
  await c.waking;
  send(res, 200, opening);
}

const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (d) => { if ((b += d).length > 4096) req.destroy(); }); req.on('end', () => ok(new URLSearchParams(b))); });
const send = (res, code, html, headers = {}) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', ...headers }); res.end(html); };

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, SELF);
  const ip = (env.BEHIND_CLOUDFLARE === 'true' && req.headers['cf-connecting-ip']) || req.socket.remoteAddress;
  try {
    // A paused centre's own address lands here (#247): switch it back on, no key, no email.
    const own = (req.headers.host || '').match(new RegExp(`^([a-z0-9-]+)\\.${DOMAIN.replaceAll('.', '\\.')}$`));
    const c = own && db.centres.find((x) => x.slug === own[1]);
    if (c) return wake(req, res, c);
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, form('', url.searchParams.get('ref')));
    // A hosted centre's "Report a problem or an idea" (#818): kept for the morning, and told at once.
    if (req.method === 'POST' && url.pathname === '/feedback' && env.FEEDBACK_KEY && req.headers['x-feedback-key'] === env.FEEDBACK_KEY) {
      const f = await new Promise((ok) => { let b = ''; req.on('data', (d) => { if ((b += d).length > 8192) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(b)); } catch { ok({}); } }); });
      if (typeof f.text !== 'string' || !f.text.trim()) return send(res, 400, '');
      const item = { centre: String(f.centre || '').slice(0, 80), from: String(f.from || '').slice(0, 120), text: f.text.trim().slice(0, 2000), at: Date.now() };
      db.feedback.unshift(item); save();
      await telegram(`Feedback from ${item.centre} (${item.from}): ${item.text}`);
      return send(res, 200, '');
    }
    // The maintainer's morning, on this Mac only (#920): the tunnel always adds cf-ray, so nothing from outside gets it.
    if (url.pathname === '/dashboard' && !req.headers['cf-ray'] && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return send(res, 200, page(`<h1>Morning</h1><pre style="white-space:pre-wrap;font:inherit">${esc(morning(db, latest, Date.now(), db.feedback))}</pre>`), { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
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
      return send(res, 303, '', { Location: `/go?k=${s.key}` });
    }
    if (req.method === 'POST' && url.pathname === '/again' && env.CF_EMAIL_TOKEN) {
      const to = ((await body(req)).get('email') || '').trim().toLowerCase();
      const c = db.centres.find((x) => x.email === to && !x.paused_at);
      if (c) await email(to, `Sign in to ${c.centre}`, `This link signs you in to ${c.slug}.${DOMAIN}. It works once, within 30 minutes.\n\n${signinLink(c.slug, to)}`);
      return send(res, 200, page(`<h1>Check your email</h1><p>If ${esc(to)} has a trial centre, a sign-in link is on its way.</p>`));
    }
    const s = db.signups.find((x) => x.key && x.key === url.searchParams.get('k'));
    if (url.pathname === '/go' && s) {
      if (!s.state) provision(s);
      return send(res, 200, page(`<h1>Creating ${esc(s.centre)}…</h1><p id="m">This takes about two minutes. Keep this page open.</p><progress style="width:100%"></progress>
<p id="o" hidden><a id="go" style="display:block;text-align:center;padding:.8rem;border-radius:.6rem;background:#3d6b50;color:#fff;font-weight:600;text-decoration:none">Open your centre</a></p>
<script>(async function poll(){const r=await fetch('/status?k=${esc(s.key)}').then(r=>r.json()).catch(()=>({}));if(r.go){const h=document.querySelector('h1');h.textContent=h.textContent.replace(/^Creating (.*)…$/,'$1 is ready');document.getElementById('m').textContent='Open it here. It works once: you choose your password first.';document.querySelector('progress').remove();document.getElementById('go').href=r.go;document.getElementById('o').hidden=false;return}if(r.state==='ready'){const h=document.querySelector('h1');h.textContent=h.textContent.replace(/^Creating (.*)…$/,'$1 is ready');document.getElementById('m').textContent='Your centre is ready, but this sign-in link has run out. WhatsApp +420 777 558 262 and we will send a new one.';document.querySelector('progress').remove();return}if(r.failed){document.getElementById('m').textContent='Something went wrong. We have been told; WhatsApp +420 777 558 262 if you want to hear back sooner.';return}setTimeout(poll,3000)})()</script>`));
    }
    if (url.pathname === '/status' && s) {
      // A fresh single-use sign-in on every ask while the centre is new (the life of a link, 30 minutes), so a reload still gets in (#588); after that, by WhatsApp.
      const go = linkOpen(s, Date.now()) ? signinLink(s.slug, s.email) : null;
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ state: s.state, go, failed: s.state === 'failed' }));
    }
    send(res, 404, page('<h1>This link is not valid</h1><p><a href="/">Start again</a></p>'));
  } catch (e) { console.error(e); send(res, 500, page('<h1>Something went wrong</h1><p>Please try again in a minute.</p>')); }
});

if (process.argv[1] === new URL(import.meta.url).pathname) {
  server.listen(Number(env.PORT || 8200), () => console.log(`provisioner on :${env.PORT || 8200}`));
  // Hourly; the morning goes out on the first run in the 7 o'clock hour of the Mac's own clock (#818), and the tidy at 03:00 in India.
  let sent = '';
  setInterval(async () => {
    await tick().catch(console.error); await watch().catch(console.error);
    const d = new Date();
    if (d.getHours() === 7 && sent !== d.toDateString()) {
      sent = d.toDateString();
      const text = morning(db, latest, Date.now(), db.feedback);
      // Read on this Mac (#920): Telegram is optional.
      writeFileSync(`${DATA}/MORNING.md`, `# Morning, ${d.toDateString()}\n\n${text.split('\n').map((l) => (l && !l.startsWith('  ') ? `- ${l}` : l)).join('\n')}\n\nAny time: http://localhost:${env.PORT || 8200}/dashboard\n`);
      await telegram(text);
    }
    if (indiaHour(d) === 3) await tidy().catch(console.error);
  }, 3_600_000);
  setInterval(() => update(), 600_000);
  watch().catch(console.error);
}
