// node scripts/uat-435.mjs — #435: a removed room or leave keeps its name in the Log, at 375x812.
// SHOT=00-before against main (:8201), SHOT=01 against the branch.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || '01';
const OUT = 'docs/design/uat/2026-10-07-log-names-removals';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = async (m, path, body) => { const r = await fetch(`${APP}/api${path}`, { method: m, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return t ? JSON.parse(t) : null; };
// Add then remove a room and a leave: the two removals the admin could not tell apart.
const room = await api('POST', '/rooms', { name: 'Lotus Annexe' });
const staff = await api('GET', '/staff');
const kiran = staff.find((s) => s.name.startsWith('Kiran')) || staff[0];
const leave = await api('POST', '/timeoff', { entity_type: 'staff', entity_id: kiran.id, date: '2026-10-20', description: 'Family wedding', plan: false });
await api('DELETE', `/timeoff/${leave.id}`);
await api('DELETE', `/rooms/${room.id}`);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(APP + '/'); await p.waitForTimeout(2000);
await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(700);
await p.getByRole('dialog').last().getByRole('button', { name: /^Settings/ }).click(); await p.waitForTimeout(1200);
await p.getByRole('button', { name: /^Log\b/ }).first().click(); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/${SHOT}.png` });
const t = await p.locator('body').innerText();
const want = ['Room Lotus Annexe removed', `Leave for ${kiran.name} removed`];
const missing = want.filter((w) => !t.includes(w));
console.log(SHOT, missing.length ? `missing: ${missing.join('; ')}` : 'pass');
if (SHOT !== '00-before') writeFileSync(`${OUT}/README.md`, `# #435 UAT, 7 Oct (lite seed)\n\nA room and a leave are added, then removed; the Log is read at 375x812.\n\nBefore (main): the lines say only 'Leave removed' and 'Room removed'.\n\n![before](00-before.png)\n\nAfter: ${missing.length ? `FAIL, missing ${missing.join('; ')}` : `pass, ${want.join(' · ')}`}.\n\n![after](01.png)\n`);
await b.close();
