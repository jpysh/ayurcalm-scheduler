// Trial sign-up (#247): signup.jains.es. A visitor gives a centre name and an
// email; the centre is created at <slug>.jains.es and an "Open your centre" link
// on screen signs them in, where they choose a password. Nothing waits on the
// email (#727): seeing their centre comes first; the email only says where it is.
// Hourly, each centre moves through lifecycle.mjs; nothing about that is emailed.
// Runs on the trial host next to Docker (hosting/centre.sh). No dependencies.
// The public pages run in their own container (public.mjs, #1091); this manager has no
// network port and answers them through ~/ruta-data/signup.
//   node provisioner/index.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, rmSync, statSync, mkdirSync, readdirSync, lstatSync } from 'node:fs';
import { next, deletesAt, refuse, slugFor, linkOpen, took, rollout } from './lifecycle.mjs';
import { morning, security, nodeLine } from './morning.mjs';

const run = promisify(execFile);
const ROOT = new URL('..', import.meta.url).pathname;
const DATA = process.env.RUTA_DATA || `${process.env.HOME}/ruta-data`;
const DOMAIN = process.env.RUTA_DOMAIN || 'jains.es';
const SELF = `https://signup.${DOMAIN}`;
const env = process.env;
const DB = `${DATA}/provisioner.json`;

// ---- state: one JSON file, written whole (a few dozen centres at most) ----
const db = { feedback: [], ...(existsSync(DB) ? JSON.parse(readFileSync(DB, 'utf8')) : { signups: [], centres: [], waitlist: [] }) };
// What the public box (#1091) may show, rewritten on every save: no centre's port or secret.
const BOX = `${DATA}/signup`;
mkdirSync(`${BOX}/inbox`, { recursive: true }); mkdirSync(`${BOX}/out`, { recursive: true });
const out = (name, o) => { writeFileSync(`${BOX}/out/.${name}.tmp`, JSON.stringify(o)); renameSync(`${BOX}/out/.${name}.tmp`, `${BOX}/out/${name}.json`); };
const view = () => ({
  email: Boolean(env.CF_EMAIL_TOKEN),
  founding: db.centres.filter((c) => c.trial?.plan === 'founding').length + Number(env.FOUNDING_ELSEWHERE || 0),
  signups: db.signups.map(({ centre, email, ip, at, key, used, state, ready_at }) => ({ centre, email, ip, at, key, used, state, ready_at })),
  centres: db.centres.map(({ slug, centre, email, paused_at, created, signed_up, trial }) => ({ slug, centre, email, paused_at, created, signed_up, trial })),
});
const save = () => { writeFileSync(`${DB}.tmp`, JSON.stringify(db, null, 1)); renameSync(`${DB}.tmp`, DB); out('state', view()); };
out('state', view());

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
// Every notice goes to the log and, once CF_EMAIL_TOKEN is set, to ALERT_EMAIL, critical lines only (alerts are email only, never Telegram).
async function notify(text) {
  console.log(`[notify] ${text}`);
  if (/^(ALERT|Provisioning FAILED)/.test(text)) await email(env.ALERT_EMAIL || 'helloayursen@gmail.com', text.split('\n')[0].slice(0, 80), text).catch(() => {});
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
      await notify(`New trial centre: ${s.centre} (${slug}.${DOMAIN}) by ${s.email}${s.ref ? `, invited by ${s.ref}` : ''}`);
    } catch (e) {
      console.error('provision failed', e); s.state = 'failed'; save();
      await notify(`Provisioning FAILED for ${s.centre} (${s.email}): ${e.message}`);
    }
  });
}

// How long each trial took to come in and to print its own day sheet (#730), told once each.
async function timings(c) {
  const [signin, sheet] = await centreSh({}, 'timings', c.slug).then((r) => r.stdout.trim().split('|').map((x) => (x ? Number(x) * 1000 : null)), () => []);
  const from = db.signups.find((s) => s.slug === c.slug)?.at ?? c.created;
  if (signin && !c.signin_at) { c.signin_at = signin; await notify(`${c.centre}: came in ${took(signin - from)} after signing up`); }
  if (sheet && !c.sheet_at) { c.sheet_at = sheet; await notify(`${c.centre}: printed its own day sheet ${took(sheet - from)} after signing up`); }
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
        await notify(`Deleted ${c.slug} (${a.why})`);
      }
    } catch (e) { console.error(`lifecycle ${c.slug}`, e); }
    save();
  }
}

// ---- the public box's requests (#1091): one file each in signup/inbox. The box is not trusted:
// every field is checked again here, and the sign-up limits are applied again on the host.
const KEY = /^[A-Za-z0-9_-]{24}$/, EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (x, n) => String(x ?? '').trim().slice(0, n);
async function answer(id, q) {
  const s = KEY.test(q.key || '') && db.signups.find((x) => x.key === q.key);
  if (q.do === 'signup') {
    const n = q.s || {}, centre = str(n.centre, 80), to = str(n.email, 120).toLowerCase(), ip = str(n.ip, 64);
    if (!centre || !EMAIL.test(to) || !KEY.test(n.key || '') || db.signups.some((x) => x.key === n.key)) return;
    if (refuse(db.signups, db.centres, { ip, email: to }, Date.now())) return;
    db.signups.push({ centre, email: to, ip, ref: /^[a-z0-9-]{1,40}$/.test(n.ref || '') ? n.ref : undefined, at: Date.now(), key: n.key }); save();
  }
  if (q.do === 'go' && s && !s.state) provision(s);
  if (q.do === 'link' && s) out(id, { go: linkOpen(s, Date.now()) ? signinLink(s.slug, s.email) : null });
  if (q.do === 'waitlist' && EMAIL.test(str(q.email, 120))) {
    db.waitlist.push({ centre: str(q.centre, 80), email: str(q.email, 120), at: Date.now() }); save();
    await notify(`Waitlist: ${str(q.centre, 80)} (${str(q.email, 120)}). ${db.centres.length} centres live.`);
  }
  if (q.do === 'again' && env.CF_EMAIL_TOKEN) {
    const to = str(q.email, 120).toLowerCase(), c = db.centres.find((x) => x.email === to && !x.paused_at);
    if (c) await email(to, `Sign in to ${c.centre}`, `This link signs you in to ${c.slug}.${DOMAIN}. It works once, within 30 minutes.\n\n${signinLink(c.slug, to)}`);
  }
  if (q.do === 'feedback' && typeof q.item?.text === 'string' && q.item.text.trim()) {
    const item = { centre: str(q.item.centre, 80), from: str(q.item.from, 120), text: str(q.item.text, 2000), at: Date.now() };
    db.feedback.unshift(item); save();
    await notify(`Feedback from ${item.centre} (${item.from}): ${item.text}`);
  }
  const c = q.do === 'wake' && db.centres.find((x) => x.slug === q.slug && x.paused_at);
  if (c && !c.waking) {
    c.waking = (async () => {
      await centreSh({}, 'start', c.slug); await up(c.port); await route(c.slug, svc(c.port));
      c.paused_at = null; c.created = Date.now(); save();
      await notify(`Switched back on: ${c.slug}`);
    })().catch((e) => console.error('wake', e)).finally(() => { delete c.waking; });
  }
}
let reading = false;
export async function inbox(now = Date.now()) {
  if (reading) return;
  reading = true;
  try {
    for (const f of readdirSync(`${BOX}/inbox`).sort()) {
      const p = `${BOX}/inbox/${f}`, id = f.match(/^([0-9a-f]{18})\.json$/)?.[1], st = lstatSync(p);
      if (!id && now - st.mtimeMs < 60_000) continue; // a .tmp still being written
      let q = null;
      try { if (id && st.isFile() && st.size < 16384) q = JSON.parse(readFileSync(p, 'utf8')); } catch {}
      rmSync(p, { force: true, recursive: true });
      if (q) await answer(id, q).catch(console.error);
    }
    for (const f of readdirSync(`${BOX}/out`)) if (f !== 'state.json' && now - lstatSync(`${BOX}/out/${f}`).mtimeMs > 60_000) rmSync(`${BOX}/out/${f}`, { force: true });
  } finally { reading = false; }
}

// The box itself, checked hourly: a sign-up page that could reach Docker or the Mac's files would undo the split.
export function boxProblems(c) {
  if (!c?.State?.Running) return ['the sign-up page is not running'];
  const p = [];
  if (c.Mounts.some((m) => /docker\.sock/.test(`${m.Source} ${m.Destination}`))) p.push('the sign-up box can reach Docker');
  if (c.Mounts.some((m) => !/\/signup\/(inbox|out)$/.test(m.Source))) p.push('the sign-up box sees more than its shared folder');
  if (!c.HostConfig.ReadonlyRootfs) p.push('the sign-up box can change its own files');
  if (c.HostConfig.Privileged || !c.Config.User || /^(0|root)(:|$)/.test(c.Config.User)) p.push('the sign-up box runs as root');
  return p;
}
const compose = (...a) => run('docker', ['compose', '-f', `${ROOT}hosting/compose.yml`, '-p', 'ruta-host', ...a], { env: { ...env, RUTA_DATA: DATA }, maxBuffer: 1 << 26 });

// ---- update (#904): a new main is tested on a throwaway centre, then rolled out. Once a day, in the
// 21:00 hour in India, after treatments (#920): one restart a night, not one per merge.
// LIVE_CENTRES in provisioner.env lists the centres with real use, e.g. "babaji:8202".
const LIVE = (env.LIVE_CENTRES || '').split(/\s+/).filter(Boolean).map((x) => ({ slug: x.split(':')[0], port: Number(x.split(':')[1]) }));
const git = (...a) => run('git', ['-C', ROOT, ...a]).then((r) => r.stdout.trim());
let updating = false;
const indiaHour = (now = new Date()) => Number(now.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
export async function update(now = false) {
  if (updating || (!now && indiaHour() !== 21)) return;
  updating = true;
  const gate = `${DATA}/gate`;
  try {
    await git('fetch', '-q', 'origin', 'main');
    const sha = await git('rev-parse', 'origin/main');
    // What the centres run, not what the clone says: a hand-moved clone must not skip a rollout (#924).
    if (sha === db.update?.deployed || sha === db.update?.failed_sha) return;
    const short = sha.slice(0, 7);
    // The tests write far more than a centre's limits allow, so they run on their own fresh copy, never on the demo.
    await run('git', ['-C', ROOT, 'worktree', 'add', '-f', '--detach', gate, sha]);
    // A bare worktree has no packages, and the browser walk in qa needs Playwright (#924).
    await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: gate, maxBuffer: 1 << 26 });
    // Fresh builds of node:24-slim and postgres:16 (#1089): the same tags, so never a new major, and the rollout
    // below builds on the images the tests ran on. Without this a security fix in Node never reached a centre.
    const gateEnv = { cwd: gate, env: { ...env, COMPOSE_PROJECT_NAME: 'ruta-gate' }, maxBuffer: 1 << 26 };
    await run('docker', ['compose', 'pull', '-q', '--ignore-buildable'], gateEnv);
    await run('docker', ['compose', 'build', '-q', '--pull'], gateEnv);
    const qa = await run('sh', [`${gate}/scripts/qa.sh`], { env: { ...env, COMPOSE_PROJECT_NAME: 'ruta-gate', APP_PORT: '8199' }, maxBuffer: 1 << 26 }).then(() => null, (e) => (e.stdout || '').split('\n').find((l) => l.includes('FAIL'))?.trim() || 'qa did not finish');
    await run('docker', ['compose', '-p', 'ruta-gate', 'down', '-v'], { cwd: gate }).catch(() => {});
    let r = { failed: qa ? 'tests' : null, why: qa };
    if (!qa) {
      if (sha !== (await git('rev-parse', 'HEAD'))) await git('merge', '-q', '--ff-only', sha);
      const sites = [{ slug: 'demo', port: 8201 }, ...LIVE, ...db.centres.filter((c) => !c.paused_at)];
      r = await rollout(sites, async (c) => { await centreSh({}, 'backup', c.slug); await centreSh({}, 'up', c.slug, String(c.port)); await up(c.port); if (!(await fetch(`http://localhost:${c.port}/api/health`).then((x) => x.ok, () => false))) throw new Error('did not come up'); });
    }
    db.update = { sha: short, at: Date.now(), failed: r.failed, why: r.why, failed_sha: r.failed ? sha : null, deployed: r.failed ? db.update?.deployed : sha }; save();
    await notify(r.failed ? `ALERT: update ${short} stopped at ${r.failed}: ${r.why}` : `Updated to ${short}: demo, live centres and trials`);
    if (!r.failed) process.exit(0); // launchd starts the service again on the new code
  } catch (e) { console.error('update', e); }
  finally { await run('git', ['-C', ROOT, 'worktree', 'remove', '-f', gate]).catch(() => {}); updating = false; }
}

// ---- tidy, nightly (#920): every update rebuilds every centre, and the build cache grew past 100 GB.
// Only what nothing uses: build cache past 20 GB (by age, most builds are this week's), images over a week old, and this repo's throwaway stacks (a session's
// check, a qa copy) left up a day, which are stopped with their data kept. Centres, the host and the
// local copy are never touched.
const KEEP = /^(ruta-.*|ayurcalm-scheduler)$/;
export const stale = (rows, now) => [...new Set(rows.filter((r) => !KEEP.test(r.project) && /ayurcalm-scheduler/.test(r.dir) && now - Date.parse(r.created) > 24 * 3_600_000).map((r) => r.project))];
export async function tidy(now = Date.now()) {
  const before = await run('df', ['-P', DATA]).then((r) => r.stdout.trim().split('\n')[1].split(/\s+/)[4], () => '?');
  await run('docker', ['builder', 'prune', '-af', '--max-used-space', '20gb']).catch(console.error);
  await run('docker', ['image', 'prune', '-af', '--filter', 'until=168h']).catch(console.error);
  const ps = await run('docker', ['ps', '--format', '{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.working_dir"}}\t{{.CreatedAt}}']).then((r) => r.stdout.trim().split('\n').filter(Boolean), () => []);
  const rows = ps.map((l) => { const [project, dir, at] = l.split('\t'); return { project, dir, created: at.split(' ').slice(0, 3).join(' ').replace(' ', 'T').replace(' ', '') }; });
  const stopped = stale(rows, now);
  for (const p of stopped) await run('docker', ['compose', '-p', p, 'stop']).catch(console.error);
  const after = await run('df', ['-P', DATA]).then((r) => r.stdout.trim().split('\n')[1].split(/\s+/)[4], () => '?');
  db.tidy = { at: now, before, after, stopped }; save();
}

// ---- watch, hourly (#248): the demo and every centre up, a backup in the last 26 h, disk not full.
// Each problem is told once by email, and once more when it clears. All clear pings HEALTHCHECKS_URL,
// so a silent host (provisioner or Mac down) raises Healthchecks.io's own alarm.
const open = new Set();
let latest = [];
export async function watch(now = Date.now()) {
  const problems = [];
  const sites = [{ slug: 'demo', port: 8201 }, ...LIVE, ...db.centres.filter((c) => !c.paused_at)];
  for (const c of sites) {
    if (!(await fetch(`http://localhost:${c.port}/api/health`).then((r) => r.ok, () => false))) problems.push(`${c.slug} is down`);
    const newest = await run('sh', ['-c', `ls -1t "${DATA}/${c.slug}/backups"/ayurcalm-*.sql.gz 2>/dev/null | head -1`]).then((r) => r.stdout.trim(), () => '');
    const age = newest ? now - (await import('node:fs')).statSync(newest).mtimeMs : Infinity;
    if (age > 26 * 3_600_000 && now - (c.created || 0) > 26 * 3_600_000) problems.push(`${c.slug}: no backup in 26 hours`);
  }
  const box = await run('docker', ['inspect', 'ruta-host-signup-1']).then((r) => JSON.parse(r.stdout)[0], () => null);
  problems.push(...boxProblems(box));
  if (!box?.State?.Running) await compose('up', '-d', 'signup').catch(console.error);
  // The manager has no port at all: everything from outside goes through the box.
  if (await run('lsof', ['-nP', '-a', '-p', String(process.pid), '-iTCP', '-sTCP:LISTEN']).then((r) => r.stdout.trim(), () => '')) problems.push('the manager listens on a network port');
  const used = await run('df', ['-P', DATA]).then((r) => Number(r.stdout.trim().split('\n')[1].split(/\s+/)[4].replace('%', '')), () => 0);
  if (used >= 85) problems.push(`disk ${used}% full`);
  for (const p of problems) if (!open.has(p)) { open.add(p); (db.events ||= []).push({ at: now, text: p }); save(); await notify(`ALERT: ${p}`); }
  for (const p of [...open]) if (!problems.includes(p)) { open.delete(p); (db.events ||= []).push({ at: now, text: `${p}, cleared` }); save(); await notify(`Cleared: ${p}`); }
  if (!problems.length && env.HEALTHCHECKS_URL) await fetch(env.HEALTHCHECKS_URL).catch(() => {});
  latest = problems;
  return problems;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  // The public box is rebuilt from this checkout whenever the manager starts, so the nightly rollout's restart refreshes it (#1091).
  console.log('manager started');
  // The first watch waits for the build: run during it, it saw no box, started a second one and raised a false alarm.
  const built = compose('up', '-d', '--build', 'signup').catch((e) => notify(`ALERT: the sign-up page did not start: ${String(e.message).split('\n')[0]}`));
  setInterval(() => inbox().catch(console.error), 500);
  // Hourly; the morning goes out on the first run in the 7 o'clock hour of the Mac's own clock (#818), and the tidy at 03:00 in India.
  let sent = '';
  setInterval(async () => {
    await tick().catch(console.error); await watch().catch(console.error);
    const d = new Date();
    if (d.getHours() === 7 && sent !== d.toDateString()) {
      sent = d.toDateString();
      const sec = `${DATA}/SECURITY.md`, sites = [{ slug: 'demo' }, ...LIVE];
      const apps = await Promise.all(sites.map((c) => run('docker', ['exec', `ruta-${c.slug}-app-1`, 'node', '-v']).then((r) => r.stdout.trim(), () => null)));
      const text = morning(db, latest, Date.now(), db.feedback, [
        existsSync(sec) ? security(readFileSync(sec, 'utf8'), statSync(sec).mtimeMs, Date.now()) : security(null, 0, Date.now()),
        nodeLine(process.version, apps.filter(Boolean)),
      ]);
      // Newest day on top, older days below, kept for good. Only on this Mac: nothing serves this file.
      const file = `${DATA}/MORNING.md`, past = existsSync(file) ? readFileSync(file, 'utf8').replace(/^# Morning log\n+/, '') : '';
      writeFileSync(file, `# Morning log\n\n## ${d.toDateString()}\n\n${text.split('\n').map((l) => (l && !l.startsWith('  ') ? `- ${l}` : l)).join('\n')}\n\n${past}`);
      await notify(text);
    }
    if (indiaHour(d) === 3) await tidy().catch(console.error);
  }, 3_600_000);
  setInterval(() => update(), 600_000);
  built.then(() => watch()).catch(console.error);
  // `touch ~/ruta-data/update-now` asks for one update now, outside the 21:00 hour (#924).
  setInterval(() => { if (existsSync(`${DATA}/update-now`)) { rmSync(`${DATA}/update-now`); update(true); } }, 60_000);
}
