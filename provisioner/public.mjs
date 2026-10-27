// The public sign-up site, ruta.jains.es/start (#247), in its own locked-down container (#1091):
// no Docker, no centre's secrets, one shared folder. It answers from what the manager
// (index.mjs, on the host) last wrote to out/, and leaves a file in inbox/ for anything that
// needs the host: a sign-up kept, a centre built or switched back on, a sign-in link, an email.
//   node provisioner/public.mjs   (PORT 8200; SIGNUP_DIR holds inbox/ and out/)
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { deletesAt, refuse, linkOpen } from './lifecycle.mjs';

const env = process.env;
const DOMAIN = env.RUTA_DOMAIN || 'jains.es';
const SELF = `https://ruta.${DOMAIN}/start`;
const BOX = env.SIGNUP_DIR || `${env.RUTA_DATA || `${env.HOME}/ruta-data`}/signup`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What the manager last wrote, plus sign-ups it has not picked up yet (a minute at most: one it refused never comes back).
const pending = new Map();
function state() {
  const f = `${BOX}/out/state.json`;
  const st = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { signups: [], centres: [], founding: 0, email: false };
  for (const [k, s] of pending) if (st.signups.some((x) => x.key === k) || Date.now() - s.at > 60_000) pending.delete(k);
  st.signups.push(...pending.values());
  return st;
}
// A request for the manager; with wait (ms), its answer, or null if none came.
// Named by the time first, so the manager reads a sign-up before the "go" sent right after it (#1139).
export const inboxId = () => Date.now().toString(16).padStart(12, '0') + randomBytes(3).toString('hex');
async function ask(req, wait = 0) {
  const id = inboxId(), f = `${BOX}/inbox/${id}`;
  writeFileSync(`${f}.tmp`, JSON.stringify(req)); renameSync(`${f}.tmp`, `${f}.json`);
  for (let t = 0; t < wait; t += 250) {
    await sleep(250);
    if (existsSync(`${BOX}/out/${id}.json`)) return JSON.parse(readFileSync(`${BOX}/out/${id}.json`, 'utf8'));
  }
  return null;
}
async function human(token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // local runs only
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token || '', remoteip: ip }),
  }).then((x) => x.json()).catch(() => ({}));
  return r.success === true;
}
const page = (body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ruta: start free</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:26rem;margin:1.5rem auto;padding:0 1rem;color:#1c2b22;background:#f3f6f3}label{display:block;margin:.8rem 0 .2rem}input{width:100%;box-sizing:border-box;padding:.7rem;border:1px solid #8a9a8f;border-radius:.6rem;font:inherit}button{margin-top:1rem;width:100%;padding:.8rem;border:0;border-radius:.6rem;background:#3d6b50;color:#fff;font:inherit;font-weight:600}a{color:#3d6b50}</style>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>${body}</html>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// One screen, phone first (#1270): who it is for, two fields, the price, and a way to look first.
const form = (msg = '', ref = '', mail = false) => page(`<header><b style="font-size:1.6rem;color:#3d6b50">Ruta</b><p style="margin:.2rem 0 0">Scheduling for residential wellness centres, including Ayurveda, spas and retreats.</p></header>
${msg && `<p role="alert"><b>${esc(msg)}</b></p>`}<form method="post" action="/signup">${/^[a-z0-9-]{1,40}$/.test(ref || '') ? `<input type="hidden" name="ref" value="${esc(ref)}">` : ''}<label for="c">Centre name</label><input id="c" name="centre" required maxlength="80" autocomplete="organization">
<label for="e">Your email</label><input id="e" name="email" type="email" required maxlength="120" autocomplete="email">
${env.TURNSTILE_SITEKEY ? `<div class="cf-turnstile" data-sitekey="${env.TURNSTILE_SITEKEY}" data-appearance="interaction-only" style="margin-top:1rem"></div>` : ''}<button>Create my centre</button></form>
<p style="text-align:center;font-size:.9rem;margin:.6rem 0 0">30 days free · no card · ₹999 a month after</p>
<a href="https://ruta-demo.${DOMAIN}" style="display:block;text-align:center;margin-top:1.2rem;padding:.8rem;border:1px solid #3d6b50;border-radius:.6rem;text-decoration:none;font-weight:600">Look first: open the demo</a>
${mail ? `<h2 style="font-size:1rem;margin-top:2rem">Already have a centre?</h2><form method="post" action="/again"><label for="a">Your email</label><input id="a" name="email" type="email" required autocomplete="email"><button>Email me a sign-in link</button></form>` : ''}
<p style="font-size:.85rem;margin-top:2rem">Your data is yours, and the code is open (<a href="https://github.com/jpysh/ruta">AGPL-3.0</a>). By starting a trial you accept the <a href="https://ruta.${DOMAIN}/pilot">pilot notice</a>. Questions: <a href="https://wa.me/420777558262">WhatsApp</a> · <a href="mailto:helloayursen@gmail.com">helloayursen@gmail.com</a> · <a href="https://ruta.${DOMAIN}">ruta.${DOMAIN}</a></p>`);

const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
async function wake(req, res, c) {
  const login = `https://${c.slug}.${DOMAIN}/login`;
  const opening = page(`<meta http-equiv="refresh" content="8;url=${login}"><h1>${esc(c.centre)} is back on</h1><p>Opening it in a few seconds. <a href="${login}">Open it now</a></p>`);
  if (!c.paused_at) return send(res, 200, opening); // switched on a moment ago; the tunnel is catching up
  if (req.method !== 'POST') return send(res, 200, page(`<h1>${esc(c.centre)} is switched off</h1><p>Nobody used it for three days, so we switched it off to save space. Everything in it is kept until <b>${day(deletesAt(c))}</b>.</p>${c.trial?.started_at ? '' : `<p>Only wanted a look around? <a href="https://ruta-demo.${DOMAIN}">The demo</a> is always on.</p>`}
<form method="post"><button>Switch it back on</button></form><p style="font-size:.85rem;margin-top:2rem">Questions: <a href="https://wa.me/420777558262">WhatsApp</a></p>`));
  await ask({ do: 'wake', slug: c.slug });
  for (let t = 0; t < 300 && state().centres.find((x) => x.slug === c.slug)?.paused_at; t++) await sleep(1000);
  send(res, 200, opening);
}

const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (d) => { if ((b += d).length > 4096) req.destroy(); }); req.on('end', () => ok(new URLSearchParams(b))); });
const send = (res, code, html, headers = {}) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', ...headers }); res.end(html); };

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, SELF);
  const ip = (env.BEHIND_CLOUDFLARE === 'true' && req.headers['cf-connecting-ip']) || req.socket.remoteAddress;
  try {
    const st = state();
    // A paused centre's own address lands here (#247): switch it back on, no key, no email.
    const own = (req.headers.host || '').match(new RegExp(`^([a-z0-9-]+)\\.${DOMAIN.replaceAll('.', '\\.')}$`));
    const c = own && st.centres.find((x) => x.slug === own[1]);
    if (c) return wake(req, res, c);
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, form('', url.searchParams.get('ref'), st.email));
    // A hosted centre's "Report a problem or an idea" (#818): kept for the morning, and told at once.
    if (req.method === 'POST' && url.pathname === '/feedback' && env.FEEDBACK_KEY && req.headers['x-feedback-key'] === env.FEEDBACK_KEY) {
      const f = await new Promise((ok) => { let b = ''; req.on('data', (d) => { if ((b += d).length > 8192) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(b)); } catch { ok({}); } }); });
      if (typeof f.text !== 'string' || !f.text.trim()) return send(res, 400, '');
      const item = { centre: String(f.centre || '').slice(0, 80), from: String(f.from || '').slice(0, 120), text: f.text.trim().slice(0, 2000), at: Date.now() };
      await ask({ do: 'feedback', item });
      return send(res, 200, '');
    }
    // The maintainer's morning, on this Mac only (#920): the tunnel always adds cf-ray, so nothing from outside gets it.
    // The landing page's "N of 10 founding places left" (#245). Founding centres not hosted here: FOUNDING_ELSEWHERE.
    if (url.pathname === '/founding') {
      const taken = st.founding;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' });
      return res.end(JSON.stringify({ left: Math.max(0, 10 - taken) }));
    }
    if (req.method === 'POST' && url.pathname === '/signup') {
      const f = await body(req);
      const centre = (f.get('centre') || '').trim().slice(0, 80), to = (f.get('email') || '').trim().toLowerCase();
      if (!centre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return send(res, 400, form('Please give a centre name and a working email.', '', st.email));
      if (!(await human(f.get('cf-turnstile-response'), ip))) return send(res, 400, form('The robot check did not pass. Please try again.', '', st.email));
      const no = refuse(st.signups, st.centres, { ip, email: to }, Date.now());
      if (no === 'waitlist') {
        await ask({ do: 'waitlist', centre, email: to });
        return send(res, 200, page(`<h1>You're on the list</h1><p>All our trial places are full right now. We will email ${esc(to)} as soon as one opens.</p>`));
      }
      if (no) return send(res, 429, form(no, '', st.email));
      const ref = /^[a-z0-9-]{1,40}$/.test(f.get('ref') || '') ? f.get('ref') : undefined;
      const s = { centre, email: to, ip, ref, at: Date.now(), key: randomBytes(18).toString('base64url') };
      pending.set(s.key, s); await ask({ do: 'signup', s });
      return send(res, 303, '', { Location: `/go?k=${s.key}` });
    }
    if (req.method === 'POST' && url.pathname === '/again' && st.email) {
      const to = ((await body(req)).get('email') || '').trim().toLowerCase();
      await ask({ do: 'again', email: to });
      return send(res, 200, page(`<h1>Check your email</h1><p>If ${esc(to)} has a trial centre, a sign-in link is on its way.</p>`));
    }
    const s = st.signups.find((x) => x.key && x.key === url.searchParams.get('k'));
    if (url.pathname === '/go' && s) {
      if (!s.state) await ask({ do: 'go', key: s.key });
      return send(res, 200, page(`<h1>Creating ${esc(s.centre)}…</h1><p id="m">This takes about two minutes.${st.email ? ` We will also email the link to ${esc(s.email)}, so you can close this page.` : ' Keep this page open.'}</p><progress style="width:100%"></progress>
<p id="o" hidden><a id="go" style="display:block;text-align:center;padding:.8rem;border-radius:.6rem;background:#3d6b50;color:#fff;font-weight:600;text-decoration:none">Open your centre</a></p>
<script>(async function poll(){const r=await fetch('/status?k=${esc(s.key)}').then(r=>r.json()).catch(()=>({}));if(r.go){const h=document.querySelector('h1');h.textContent=h.textContent.replace(/^Creating (.*)…$/,'$1 is ready');document.getElementById('m').textContent='Open it here. It works once: you choose your password first.';document.querySelector('progress').remove();document.getElementById('go').href=r.go;document.getElementById('o').hidden=false;return}if(r.state==='ready'){const h=document.querySelector('h1');h.textContent=h.textContent.replace(/^Creating (.*)…$/,'$1 is ready');document.getElementById('m').textContent='Your centre is ready, but this sign-in link has run out. WhatsApp +420 777 558 262 and we will send a new one.';document.querySelector('progress').remove();return}if(r.failed){document.getElementById('m').textContent='Something went wrong. We have been told; WhatsApp +420 777 558 262 if you want to hear back sooner.';return}setTimeout(poll,3000)})()</script>`));
    }
    if (url.pathname === '/status' && s) {
      // A fresh single-use sign-in on every ask while the centre is new (the life of a link, 30 minutes), so a reload still gets in (#588); after that, by WhatsApp.
      const go = linkOpen(s, Date.now()) ? (await ask({ do: 'link', key: s.key }, 5000))?.go ?? null : null;
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ state: s.state, go, failed: s.state === 'failed' }));
    }
    send(res, 404, page('<h1>This link is not valid</h1><p><a href="/">Start again</a></p>'));
  } catch (e) { console.error(e); send(res, 500, page('<h1>Something went wrong</h1><p>Please try again in a minute.</p>')); }
});


if (process.argv[1] === new URL(import.meta.url).pathname) server.listen(Number(env.PORT || 8200), () => console.log(`sign-up page on :${env.PORT || 8200}`));
