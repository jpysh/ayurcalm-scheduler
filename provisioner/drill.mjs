// The trial host's drill (#247), against real Docker, on this machine. Not in CI:
// it builds one centre. Scratch data, no tunnel, no Turnstile, a fake clock.
//   node provisioner/drill.mjs
// 1. Abuse: 30 scripted sign-ups hit the limits, and the service still answers.
// 2. One centre is built, paused at 72 h idle, switched back on from its own
//    address, paused again and deleted 14 days later.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

Object.assign(process.env, { RUTA_DATA: mkdtempSync(join(tmpdir(), 'ruta-drill-')), BEHIND_CLOUDFLARE: 'true', CENTRE_PORT_FROM: '8390', PORT: '0' });
delete process.env.TURNSTILE_SECRET; delete process.env.CF_EMAIL_TOKEN; delete process.env.TELEGRAM_BOT_TOKEN;
const { server, tick } = await import('./index.mjs');
await new Promise((ok) => server.listen(0, ok));
const port = server.address().port;
const H = 3_600_000, D = 24 * H;

const call = (path, { method = 'GET', ip = '10.0.0.1', host = 'localhost', form } = {}) => new Promise((ok, no) => {
  const data = form ? new URLSearchParams(form).toString() : '';
  const req = http.request({ port, path, method, headers: { host, 'cf-connecting-ip': ip, 'content-type': 'application/x-www-form-urlencoded', 'content-length': data.length } }, (res) => {
    let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => ok({ code: res.statusCode, body: b, location: res.headers.location }));
  });
  req.on('error', no); req.end(data);
});
const signup = (i, ip, email = `drill${i}@example.com`) => call('/signup', { method: 'POST', ip, form: { centre: i === 0 ? 'Drill Centre' : `Drill ${i}`, email } });

// ---- 1. abuse ----
const codes = [];
for (let i = 0; i < 3; i++) codes.push((await signup(i, '10.0.0.1')).code);           // 3 from one connection: fine
codes.push((await signup(3, '10.0.0.1')).code);                                         // the 4th: refused
codes.push((await signup(4, '10.0.0.2', 'drill1@example.com')).code);                   // same email again: refused
for (let i = 5; i < 30; i++) codes.push((await signup(i, `10.0.1.${i}`)).code);         // new connections until the day's 20
const ok = codes.filter((c) => c === 303).length, refused = codes.filter((c) => c === 429).length;
assert.equal(codes[3], 429, 'a 4th sign-up from one connection is refused');
assert.equal(codes[4], 429, 'a second sign-up for one email is refused');
assert.equal(ok, 20, 'exactly 20 sign-ups a day go through');
assert.equal(ok + refused, 30, 'every refusal is a plain 429, nothing broke');
assert.equal((await call('/')).code, 200, 'the sign-up page still answers');
assert.equal((await call('/founding')).code, 200);
assert.equal((await call('/signup', { method: 'POST', form: { centre: 'x', email: 'not an email' } })).code, 400);
console.log(`abuse: 30 sign-ups, ${ok} accepted, ${refused} refused, service up`);

// ---- 2. lifecycle, one real centre ----
const state = () => JSON.parse(readFileSync(`${process.env.RUTA_DATA}/provisioner.json`, 'utf8'));
const key = state().signups.find((s) => s.centre === 'Drill Centre').key;
await call(`/go?k=${key}`);
let s;
for (let i = 0; i < 200 && !['ready', 'failed'].includes((s = state().signups.find((x) => x.key === key)).state); i++) await new Promise((r) => setTimeout(r, 3000));
assert.equal(s.state, 'ready', 'the centre was built');
const c = state().centres[0];
const host = `${c.slug}.${process.env.RUTA_DOMAIN || 'jains.es'}`;
const health = () => fetch(`http://localhost:${c.port}/api/health`).then((r) => r.ok, () => false);
assert.equal(await health(), true);
console.log(`built ${c.slug} on :${c.port}`);

await tick(c.created + 71 * H);
assert.equal(await health(), true, 'not paused before 72 h');
await tick(c.created + 72 * H);
assert.equal(await health(), false, 'paused at 72 h idle');
const off = await call('/login', { host });
assert.match(off.body, /is switched off/); assert.match(off.body, /Switch it back on/);
const on = await call('/login', { host, method: 'POST' });
assert.match(on.body, /is back on/);
assert.equal(await health(), true, 'switched back on from its own address');
const restored = state().centres[0];
assert.equal(restored.paused_at, null);
console.log('paused at 72 h, switched back on from its own page');

await tick(restored.created + 72 * H);
assert.equal(await health(), false, 'paused again after another 72 h');
const pausedAt = state().centres[0].paused_at;
await tick(pausedAt + 14 * D - 1);
assert.equal(state().centres.length, 1, 'kept until 14 days');
await tick(pausedAt + 14 * D);
assert.equal(state().centres.length, 0, 'deleted after 14 days paused');
assert.equal(existsSync(`${process.env.RUTA_DATA}/${c.slug}`), false, 'its files are gone');
assert.equal(execFileSync('docker', ['volume', 'ls', '-q', '--filter', `name=ruta-${c.slug}_`]).toString().trim(), '', 'its database is gone');
assert.equal((await call('/login', { host })).code, 404, 'its address no longer knows it');
console.log('deleted 14 days after pausing; read-only at the end of a trial is the app\'s own (server/src/tests/trial.test.ts)');
server.close();
console.log('drill ok');
process.exit(0);
