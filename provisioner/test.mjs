// Fake-clock checks for the trial lifecycle and sign-up limits (#247).
import assert from 'node:assert/strict';
import { next, deletesAt, refuse, slugFor } from './lifecycle.mjs';
const H = 3_600_000, D = 24 * H, t0 = Date.parse('2026-10-01T00:00:00Z');

// Level 1 idle 72 h -> paused; paused 14 days -> deleted. No warnings: nothing is emailed.
const idle = { created: t0 };
assert.equal(next(idle, t0 + 71 * H), null);
assert.equal(next(idle, t0 + 72 * H).do, 'pause');
const paused = { created: t0, paused_at: t0 + 72 * H };
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
assert.equal(refuse([], Array.from({ length: 25 }, (_, i) => ({ email: `e${i}` })), { ip: 'x', email: 'y' }, t0), 'waitlist');

assert.equal(slugFor('Shanti Kutir Ayurveda!', []), 'shanti-kutir-ayurveda');
assert.equal(slugFor('Demo', []), 'demo-2');
assert.equal(slugFor('Om', ['om', 'om-2']), 'om-3');
console.log('provisioner lifecycle ok');
