// Fake-clock checks for the trial lifecycle and sign-up limits (#247).
import assert from 'node:assert/strict';
import { next, deletesAt, refuse, slugFor, linkOpen, took, rollout } from './lifecycle.mjs';
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
{
  const { mkdtempSync } = await import('node:fs');
  process.env.RUTA_DATA = mkdtempSync('/tmp/ruta-test-');
  process.env.CF_EMAIL_TOKEN = 'set';
  const { server } = await import('./index.mjs');
  await new Promise((ok) => server.listen(0, ok));
  const r = await fetch(`http://localhost:${server.address().port}/signup`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ centre: 'Om', email: 'a@b.co' }) });
  server.close();
  assert.equal(r.status, 303);
  assert.match(r.headers.get('location'), /^\/go\?k=/);
  console.log('sign-up straight in ok');
}

// The morning (#818): the push picks a health problem first, then a silent trial about to end.
{
  const { morning } = await import('./morning.mjs');
  const now = Date.parse('2030-04-10T07:00:00Z'), D = 86_400_000;
  const db = { signups: [{ at: now - 3600_000 }], waitlist: [], centres: [{ centre: 'Shanti', email: 's@x', created: now - 28 * D, trial: { ends_at: new Date(now + 2 * D).toISOString() } }] };
  assert.match(morning(db, ['demo is down'], now), /^Today's push: Fix: demo is down/);
  assert.match(morning(db, [], now), /^Today's push: Call Shanti \(s@x\): trial ends in 2 days/);
  assert.match(morning(db, [], now), /Sign-ups: 1 yesterday, 1 this week/);
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
  console.log('tidy ok');
}
