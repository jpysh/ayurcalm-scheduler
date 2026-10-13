// E2E_BASE_URL=http://localhost:8745 node scripts/uat-760.mjs — #760: a therapist away all day sees it above their treatments. 375x812.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-13-link-off-all-day';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = (m, path, body) => fetch(`${APP}/api${path}`, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) }).then((r) => r.text()).then((t) => (t ? JSON.parse(t) : null));
const s = await api('GET', '/settings');
const day = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: s.timezone });
const free = new Set((await api('GET', `/staff-day?date=${day}`)).filter((x) => !x.off && x.busy.some((b) => b.label === 'treatment')).map((x) => x.staff_id));
const who = (await api('GET', '/staff')).find((x) => x.role !== 'doctor' && free.has(x.id));
const off = await api('POST', '/timeoff', { entity_type: 'staff', entity_id: who.id, date: day, start_date: day, end_date: day, description: 'Family emergency', plan: false });
const { token: link } = await api('POST', `/staff/${who.id}/link`, {});
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true })).newPage();
await p.goto(`${APP}/l/${link}?date=${day}`); await p.waitForTimeout(2500);
if (!(await p.getByText('Not in all day · Family emergency').count())) { await p.getByText('›', { exact: true }).first().click(); await p.waitForTimeout(1500); }
await p.screenshot({ path: `${OUT}/01-link.png` });
const ok = (await p.getByText('Not in all day · Family emergency').count()) === 1;
console.log(ok ? 'pass' : 'FAIL', 'the link says they are away');
await api('DELETE', `/timeoff/${off.id}`);
writeFileSync(`${OUT}/README.md`, `# #760 UAT, 13 Oct (demo seed)\n\n${ok ? 'pass' : 'FAIL'}: a therapist away all day tomorrow sees it above their treatments.\n\n![](01-link.png)\n`);
await b.close();
process.exit(ok ? 0 : 1);
