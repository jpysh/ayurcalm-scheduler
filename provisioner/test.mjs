// Fake-clock checks for the trial lifecycle and sign-up limits (#247).
import assert from 'node:assert/strict';
import { next, nudge, nudgeEmail, activated, deletesAt, refuse, slugFor, linkOpen, took, rollout, releaseHour } from './lifecycle.mjs';
const H = 3_600_000, D = 24 * H, t0 = Date.parse('2026-10-01T00:00:00Z');

// Level 1 idle 72 h -> paused; paused 14 days -> deleted. No warnings: nothing is emailed.
const idle = { created: t0 };
assert.equal(next(idle, t0 + 71 * H), null);
assert.equal(next(idle, t0 + 72 * H).do, 'pause');
const paused = { created: t0 - 30 * D, paused_at: t0 + 72 * H }; // signed up long ago: the 30-day floor (#920) is checked below
assert.equal(next(paused, paused.paused_at + 14 * D - 1), null);
assert.equal(deletesAt(paused), paused.paused_at + 14 * D);
assert.equal(next(paused, paused.paused_at + 14 * D).do, 'delete');
// Switched back on: the 72 h start again from the restore.
assert.equal(next({ created: t0 + 20 * D }, t0 + 20 * D + 71 * H), null);
// Real trial: never paused; read-only at the end is the app's; deleted 60 days after.
const ends = t0 + 30 * D, real = { created: t0, trial: { started_at: new Date(t0).toISOString(), ends_at: new Date(ends).toISOString() } };
assert.equal(next(real, t0 + 5 * D), null);
assert.equal(next(real, ends + 59 * D), null);
assert.equal(next(real, ends + 60 * D).do, 'delete');

// Paid: never touched, however long ago the trial ended (#250).
assert.equal(next({ ...real, trial: { ...real.trial, plan: 'founding' } }, ends + 400 * D), null);

// Limits.
const s = (ip, email, at = t0) => ({ ip, email, at });
assert.match(refuse([s('1', 'a'), s('1', 'b'), s('1', 'c')], [], { ip: '1', email: 'd' }, t0), /connection/);
assert.equal(refuse([s('1', 'a'), s('1', 'b'), s('1', 'c', t0 - 2 * D)], [], { ip: '1', email: 'd' }, t0), null);
assert.match(refuse([], [{ email: 'a' }], { ip: '2', email: 'a' }, t0), /already/);
assert.match(refuse(Array.from({ length: 20 }, (_, i) => s(`ip${i}`, `e${i}`)), [], { ip: 'x', email: 'y' }, t0), /as many/);
assert.equal(refuse([], Array.from({ length: 10 }, (_, i) => ({ email: `e${i}` })), { ip: 'x', email: 'y' }, t0), 'waitlist');
assert.equal(refuse([], Array.from({ length: 9 }, (_, i) => ({ email: `e${i}` })), { ip: 'x', email: 'y' }, t0), null);

assert.equal(slugFor('Shanti Kutir Ayurveda!', []), 'shanti-kutir-ayurveda');
assert.equal(slugFor('Demo', []), 'demo-2');
assert.equal(slugFor('Om', ['om', 'om-2']), 'om-3');
// The sign-up page may ask again and again for 30 minutes after the centre is ready (#588).
const up = { state: 'ready', ready_at: t0 };
assert.equal(linkOpen(up, t0 + 5 * 60_000), true);
assert.equal(linkOpen(up, t0 + 29 * 60_000), true);
assert.equal(linkOpen(up, t0 + 31 * 60_000), false);
assert.equal(linkOpen({ state: 'building' }, t0), false);
assert.equal(took(4 * 60_000), '4 min');
assert.equal(took(125 * 60_000), '2 h 5 min');
assert.equal(took(2 * H), '2 h');
assert.equal(took(D + H), '1 day 1 h');
assert.equal(took(3 * D), '3 days');
console.log('provisioner lifecycle ok');

// Sign-up goes straight to the centre even when email is set up: nothing waits on an inbox (#727).
// The public box and the manager talk only through the shared folder (#1091).
{
  const { mkdtempSync, readFileSync } = await import('node:fs');
  process.env.RUTA_DATA = mkdtempSync('/tmp/ruta-test-');
  process.env.CF_EMAIL_TOKEN = 'set';
  const { inbox } = await import('./index.mjs');
  const { server } = await import('./public.mjs');
  await new Promise((ok) => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  assert.match(await fetch(base).then((r) => r.text()), /Already have a centre\?/, 'the manager tells the box email is set up');
  const r = await fetch(`${base}/signup`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ centre: 'Om', email: 'a@b.co' }) });
  assert.equal(r.status, 303);
  assert.match(r.headers.get('location'), /^\/go\?k=/);
  await inbox();
  const kept = JSON.parse(readFileSync(`${process.env.RUTA_DATA}/provisioner.json`, 'utf8')).signups;
  assert.deepEqual(kept.map((s) => s.email), ['a@b.co'], 'the manager kept the sign-up');
  assert.equal((await fetch(`${base}/signup`, { method: 'POST', body: new URLSearchParams({ centre: 'Om', email: 'a@b.co' }) })).status, 429, 'the box sees what the manager kept');
  assert.equal((await fetch(`${base}/feedback`, { method: 'POST', body: '{"text":"x"}' })).status, 404, 'feedback needs the key');
  // A box that is not trusted: a forged sign-up past the day's limit is dropped by the manager.
  const { writeFileSync } = await import('node:fs');
  for (let i = 0; i < 25; i++) writeFileSync(`${process.env.RUTA_DATA}/signup/inbox/${String(i).padStart(18, '0')}.json`, JSON.stringify({ do: 'signup', s: { centre: 'X', email: `x${i}@b.co`, ip: `1.1.1.${i}`, key: `k${String(i).padStart(23, '0')}` } }));
  await inbox();
  assert.equal(JSON.parse(readFileSync(`${process.env.RUTA_DATA}/provisioner.json`, 'utf8')).signups.length, 20, 'twenty a day, however many the box sends');
  // A "go" written right after its sign-up is read after it, or the centre is never built (#1139).
  const { inboxId } = await import('./public.mjs');
  const ids = [];
  for (let i = 0; i < 3; i++) { ids.push(inboxId()); await new Promise((r) => setTimeout(r, 2)); }
  assert.deepEqual([...ids].sort(), ids, 'the inbox is not read in the order requests arrived');
  assert.ok(ids.every((id) => /^[0-9a-f]{18}$/.test(id)), 'an inbox name the manager would skip');
  server.close();
  console.log('sign-up through the shared folder ok');
}

// Backups are hourly, so two hours without one raises the alarm; a new centre gets two hours for its first (#1178).
{
  const { noBackup } = await import('./index.mjs');
  assert.equal(noBackup(2 * H - 1, t0 - D, t0), false);
  assert.equal(noBackup(2 * H + 1, t0 - D, t0), true);
  assert.equal(noBackup(Infinity, t0 - H, t0), false, 'a centre an hour old has no backup yet');
  assert.equal(noBackup(Infinity, t0 - 3 * H, t0), true);
}

// The sign-up box is flagged hourly if it could ever reach Docker or the Mac (#1091).
{
  const { boxProblems } = await import('./index.mjs');
  const good = { State: { Running: true }, Config: { User: 'node' }, HostConfig: { ReadonlyRootfs: true }, Mounts: [{ Source: '/Users/w/ruta-data/signup/inbox', Destination: '/box/inbox' }, { Source: '/Users/w/ruta-data/signup/out', Destination: '/box/out' }] };
  assert.deepEqual(boxProblems(good), []);
  assert.deepEqual(boxProblems({ ...good, Mounts: [...good.Mounts, { Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock' }] }), ['the sign-up box can reach Docker', 'the sign-up box sees more than its shared folder']);
  assert.deepEqual(boxProblems({ ...good, Config: { User: '' } }), ['the sign-up box runs as root']);
  assert.deepEqual(boxProblems({ ...good, HostConfig: { ReadonlyRootfs: false } }), ['the sign-up box can change its own files']);
  assert.deepEqual(boxProblems(null), ['the sign-up page is not running']);
  // The real compose file: no socket, read-only, not root, one shared folder.
  const y = (await import('node:fs')).readFileSync(new URL('../hosting/compose.yml', import.meta.url), 'utf8');
  const box = y.slice(y.indexOf('  signup:'), y.indexOf('  offsite:'));
  assert.doesNotMatch(box, /docker\.sock|privileged/);
  assert.match(box, /read_only: true/); assert.match(box, /user: node/); assert.match(box, /127\.0\.0\.1:8200:8200/);
  assert.deepEqual(box.match(/^      - .*:\/box\/.*$/gm).length, 2);
  assert.doesNotMatch((await import('node:fs')).readFileSync(new URL('./index.mjs', import.meta.url), 'utf8'), /\.listen\(|createServer/, 'the manager opens no port');
  console.log('sign-up box locked down ok');
}

// The three behaviour emails (#1301), each once; never for Babaji or a paying centre.
{
  const D = 86_400_000, start = Date.parse('2030-04-01T05:00:00Z');
  const c = (x) => ({ slug: 't', centre: 'Shanti', trial: { started_at: new Date(start).toISOString(), ends_at: new Date(start + 30 * D).toISOString() }, ...x });
  assert.equal(nudge(c(), start + D), null);
  assert.equal(nudge(c(), start + 2 * D), 'nosheet');
  assert.equal(nudge(c({ sent: { nosheet: 1 } }), start + 5 * D), null);
  assert.equal(nudge(c({ sheet_at: start, sheets: [start + D] }), start + 3 * D), null);
  assert.equal(nudge(c({ sheet_at: start, sheets: [start + D] }), start + 4 * D), 'silent');
  assert.equal(nudge(c({ sheet_at: start, sheets: [start + 22 * D], sent: { silent: 1 } }), start + 23 * D), 'ending');
  assert.equal(nudge(c({ slug: 'babajiayurveda' }), start + 23 * D), null);
  assert.equal(nudge(c({ trial: { started_at: 'x', plan: 'founding' } }), start + 23 * D), null);
  assert.match(nudgeEmail('ending', c(), 'jains.es')[1], /^7 days left\. Reply or WhatsApp \+420777558262 to keep going/);
  assert.equal(activated(c({ sheets: [start + D, start + 2 * D, start + 6 * D] })), true);
  assert.equal(activated(c({ sheets: [start + D, start + 2 * D, start + 8 * D] })), false);
  console.log('behaviour emails ok');
}

// The morning (#818): the push picks a health problem first, then a silent trial about to end.
{
  const { morning } = await import('./morning.mjs');
  const now = Date.parse('2030-04-10T07:00:00Z'), D = 86_400_000;
  const db = { signups: [{ at: now - 3600_000 }], waitlist: [], centres: [{ centre: 'Shanti', email: 's@x', created: now - 28 * D, trial: { ends_at: new Date(now + 2 * D).toISOString() } }] };
  assert.match(morning(db, ['demo is down'], now), /^Today's push: Fix: demo is down/);
  assert.match(morning(db, [], now), /^Today's push: Call Shanti \(s@x\): trial ends in 2 days/);
  assert.match(morning(db, [], now), /Sign-ups: 1 yesterday, 1 this week/);
  assert.match(morning(db, [], now), /Activated: none yet · silent 3\+ days: none/);
  console.log('morning ok');
}

// A failed step stops the rollout: a demo that fails means no live centre is updated (#904).
const done = [];
const r = await rollout([{ slug: 'demo' }, { slug: 'babaji' }, { slug: 't1' }], async (x) => { if (x.slug === 'demo') throw new Error('demo did not come up'); done.push(x.slug); });
assert.deepEqual(done, []);
assert.equal(r.failed, 'demo');
const all = [];
assert.equal((await rollout([{ slug: 'demo' }, { slug: 'babaji' }], async (x) => { all.push(x.slug); })).failed, null);
assert.deepEqual(all, ['demo', 'babaji']);
// A rollback puts back the sites already updated and the one that failed, never those not reached (#1178).
const mid = await rollout([{ slug: 'demo' }, { slug: 'babaji' }, { slug: 't1' }], async (x) => { if (x.slug === 'babaji') throw new Error('did not come up'); });
assert.deepEqual(mid.touched.map((x) => x.slug), ['demo', 'babaji']);

// Nothing is deleted within 30 days of signing up (#920), even a centre paused on day 3.
assert.equal(deletesAt({ created: t0, signed_up: t0, paused_at: t0 + 3 * D }), t0 + 30 * D);
assert.equal(next({ created: t0 + 10 * D, signed_up: t0, paused_at: t0 + 13 * D }, t0 + 29 * D), null, 'switched back on resets created, not the sign-up');
assert.equal(deletesAt({ created: t0, paused_at: t0 + 20 * D }), t0 + 34 * D);
// The nightly tidy stops only this repo's throwaway stacks left up a day (#920).
{
  const { stale } = await import('./index.mjs');
  const now = Date.parse('2030-04-10T07:00:00Z'), old = '2030-04-08T07:00:00+0000', fresh = '2030-04-10T06:00:00+0000', dir = '/u/code/ayurcalm-scheduler/.claude/worktrees/x';
  assert.deepEqual(stale([
    { project: 'qa906', dir, created: old }, { project: 'qa906', dir, created: old },
    { project: 'audit911', dir, created: fresh }, { project: 'ruta-babaji', dir, created: old },
    { project: 'ayurcalm-scheduler', dir, created: old }, { project: 'other-app', dir: '/u/code/other', created: old },
  ], now), ['qa906']);
  const { gone } = await import('./index.mjs');
  const D = 86_400_000, home = '/Users/w/code/Ranikhet/ayurcalm-scheduler/.claude/worktrees/x', ago = (d) => new Date(now - d * D).toISOString();
  const row = (project, days, o = {}) => ({ project, dir: home, running: false, finished: ago(days), volumes: [`${project}_pg`], ...o });
  assert.deepEqual(gone([
    row('qa4', 4), row('qa4', 5), row('qa2', 2), row('ruta-babaji', 30), row('ayurcalm-scheduler', 9),
    row('oddname', 9, { dir: '/Users/w/ruta-host' }), row('up', 0, { running: true, finished: '0001-01-01T00:00:00Z' }),
    row('shared', 9, { volumes: ['up_pg'] }), row('', 9), row('mixed', 9), row('mixed', 1),
  ], now), ['qa4']);
  assert.deepEqual(stale([{ project: 'up', dir: home, created: old }], now), ['up']);
  console.log('tidy ok');
}

// The morning carries the weekly security verdict and the host's Node (#1089).
{
  const { security, nodeLine } = await import('./morning.mjs');
  const now = Date.parse('2030-04-10T07:00:00Z'), D = 86_400_000;
  assert.equal(security('Security (Mon 8 Apr): all clear\nmore', now - 2 * D, now), 'Security (Mon 8 Apr): all clear');
  assert.equal(security('Security (Mon 1 Apr): all clear', now - 9 * D, now), 'Security: weekly check has not run for over a week');
  assert.equal(security(null, 0, now), 'Security: weekly check has not run for over a week');
  assert.equal(nodeLine('v24.22.1', ['v24.22.1']), 'Node: v24.22.1 on the host');
  assert.match(nodeLine('v24.22.1', ['v24.22.0', 'v24.23.0']), /older than the centres' v24\.23\.0/);
  assert.equal(nodeLine('v24.22.1', ['v26.0.0']), 'Node: v24.22.1 on the host', 'another major is a deliberate upgrade');
  console.log('morning security ok');
}

// The weekly release hour is Wednesday 20:00 India time (#1178), whatever the host's clock zone.
assert.equal(releaseHour(new Date('2030-01-02T14:30:00Z')), true); // Wed 20:00 IST
assert.equal(releaseHour(new Date('2030-01-02T15:30:00Z')), false); // Wed 21:00 IST
assert.equal(releaseHour(new Date('2030-01-01T14:30:00Z')), false); // Tue 20:00 IST
