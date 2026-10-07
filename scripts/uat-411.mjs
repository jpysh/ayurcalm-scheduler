// node scripts/uat-411.mjs — #411: every write lands in the Log, in words, at 375x812.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-07-log-every-write';
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = async (m, path, body) => (await fetch(`${APP}/api${path}`, { method: m, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const lines = [];
const shot = async (id, title, ok, note) => { await p.screenshot({ path: `${OUT}/${id}.png` }); lines.push(`| ${id} | ${title} | ${ok ? 'pass' : 'FAIL'} | ${note} | ![${id}](${id}.png) |`); console.log(id, ok, note); };
// Three everyday writes the Log used to miss: a room, a leave, a new patient.
await api('POST', '/rooms', { name: 'Lotus Annexe' });
const staff = await api('GET', '/staff');
const kiran = staff.find((s) => s.name.startsWith('Kiran')) || staff[0];
await api('POST', '/timeoff', { entity_type: 'staff', entity_id: kiran.id, date: '2026-10-20', description: 'Family wedding', plan: false });
await api('POST', '/patients', { name: 'Meera Nair', gender: 'female' });
await p.goto(APP + '/'); await p.waitForTimeout(2000);
await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(700);
await p.getByRole('dialog').last().getByRole('button', { name: /^Settings/ }).click(); await p.waitForTimeout(1200);
await p.getByRole('button', { name: /^Log\b/ }).first().click(); await p.waitForTimeout(1500);
const t = await p.locator('body').innerText();
const want = ['Patient Meera Nair added', `Leave for ${kiran.name} added`, 'Room Lotus Annexe added'];
const missing = want.filter((w) => !t.includes(w));
await shot('01', 'The Log after a room, a leave and a patient are added', missing.length === 0, missing.length ? `missing: ${missing.join('; ')}` : want.join(' · '));
writeFileSync(`${OUT}/README.md`, `# #411 UAT, 7 Oct (full seed)\n\nBefore (Task B, s22-01): after a walk that added a patient, four bookings and a leave, the Log showed only the four seeded rows.\n\n![before](00-before.png)\n\n| # | Step | Result | Read | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
await b.close();
