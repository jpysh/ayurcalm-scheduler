/**
 * Sign-in (#417): after ten wrong passwords from one address the eleventh try
 * is refused for 15 minutes, and every page carries a Content-Security-Policy.
 * Run last in qa: it locks out the test address's wrong tries only, so a right
 * password from the same address afterwards is also refused until the window ends.
 * Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;

async function main() {
  const health = await fetch(`${API_BASE}/health`);
  assert.match(health.headers.get('content-security-policy') || '', /script-src 'self'/);
  const login = (password: string) => fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nobody@example.com', password }) });
  for (let i = 0; i < 10; i++) assert.equal((await login(`wrong${i}`)).status, 401, `try ${i + 1} is an ordinary wrong password`);
  const eleventh = await login('wrong10');
  assert.equal(eleventh.status, 429);
  assert.match((await eleventh.json()).error, /15 minutes/);
  console.log('Sign-in: ten wrong passwords, then the address waits 15 minutes; pages carry a CSP.');
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
