// node scripts/uat-polish-staff-leave.mjs — Staff rows with a leave still to come, 375x812 and 200% text (#635 follow-up).
// SHOT=before against main, SHOT=after (default) against the branch. Adds a leave in 3 days and one in 20, then removes them.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || 'after';
const OUT = process.env.OUT || 'docs/design/uat/2026-10-13-polish-staff-leave';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = (m, path, body) => fetch(`${APP}/api${path}`, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) }).then((r) => r.text()).then((t) => (t ? JSON.parse(t) : null));
const s = await api('GET', '/settings');
const inDays = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: s.timezone });
const staff = (await api('GET', '/staff')).filter((x) => x.role !== 'doctor');
const offs = [];
for (const [who, n] of [[staff[1], 3], [staff[2], 20]]) offs.push(await api('POST', '/timeoff', { entity_type: 'staff', entity_id: who.id, date: inDays(n), start_date: inDays(n), end_date: inDays(n + 1), description: 'Leave', plan: false }));
const b = await chromium.launch();
for (const zoom of [1, 2]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: s.timezone });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  await p.goto(`${APP}/admin/team`); await p.waitForTimeout(2500);
  if (zoom === 2) await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  if (zoom === 1) for (const w of [staff[1], staff[2]]) console.log(SHOT, (await p.getByRole('button', { name: new RegExp(`^${w.name}`) }).first().innerText()).replace(/\s+/g, ' '));
  await p.screenshot({ path: `${OUT}/${SHOT}-staff${zoom === 2 ? '-200' : ''}.png` });
  await ctx.close();
}
for (const o of offs) await api('DELETE', `/timeoff/${o.id}`);
await b.close();
