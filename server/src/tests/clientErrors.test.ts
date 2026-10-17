/**
 * A browser error report (#826) is stored under whoever sent it, never under an
 * id the body names, and a body that is not an error report is refused.
 * Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;

async function main() {
  const { token, user } = await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) }).then((r) => r.json());
  const send = (body: unknown) => fetch(`${API_BASE}/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const message = `test ${Date.now()}`;
  assert.equal((await send({ message, url: 'http://x/', user_id: 'someone-else' })).status, 204);
  const rows: { admin_id: string; old_value: Record<string, unknown> }[] = await fetch(`${API_BASE}/client-errors`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const row = rows.find((r) => r.old_value?.message === message);
  assert.ok(row, 'the report is stored');
  assert.equal(row.admin_id, user.id, 'stored under the caller');
  assert.equal(row.old_value.user_id, undefined, 'unknown fields are dropped');
  assert.equal((await send({ anything: 'at all' })).status, 400, 'a body with no message is refused');
  assert.equal((await send({ message: 'x'.repeat(5000) })).status, 400, 'an oversized message is refused');
  console.log('Client errors: stored under the caller, checked by shape and size.');
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
