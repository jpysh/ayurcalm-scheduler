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
  // A made-up X-Forwarded-For is a fresh address each time; the account still stops at thirty.
  const spoofed = (i: number) => fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `203.0.113.${i}` }, body: JSON.stringify({ email: 'target@example.com', password: `wrong${i}` }) });
  for (let i = 0; i < 30; i++) assert.equal((await spoofed(i)).status, 401, `spoofed try ${i + 1} is an ordinary wrong password`);
  assert.equal((await spoofed(30)).status, 429, 'a thirty-first try on one account waits, whatever address it claims');
  console.log('Sign-in: ten wrong passwords per address, thirty per account, then a 15-minute wait; pages carry a CSP.');
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
