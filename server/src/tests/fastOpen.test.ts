/**
 * A fast first open (#416): a built script comes compressed and cached for a
 * year, and the week strip's appointments come in one call that matches the
 * seven one-day calls it replaced. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const ROOT = API_BASE.replace(/\/api$/, '');

async function main() {
  const html = await (await fetch(`${ROOT}/`)).text();
  const script = html.match(/\/assets\/[^"]+\.js/)?.[0];
  if (script) {
    const res = await fetch(`${ROOT}${script}`, { headers: { 'Accept-Encoding': 'br, gzip' } });
    assert.equal(res.headers.get('content-encoding'), 'br');
    assert.match(res.headers.get('cache-control') || '', /immutable/);
    assert.ok((await res.text()).length > 1000, 'the script decodes');
  }
  const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
  const get = async (q: string) => (await (await fetch(`${API_BASE}/appointments?${q}`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { id: string }[];
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.now() + (i - 3) * 86400000).toISOString().slice(0, 10));
  const one = (await Promise.all(days.map((d) => get(`date=${d}`)))).flat().map((a) => a.id).sort();
  const week = (await get(`from=${days[0]}&to=${days[6]}`)).map((a) => a.id).sort();
  assert.deepEqual(week, one, 'the week call returns what the seven day calls did');
  console.log(`Fast open: ${script ? 'the script is compressed and cached for a year; ' : ''}the week comes in one call (${week.length} treatments).`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
