// E2E_BASE_URL=http://localhost:8098 node scripts/uat-671.mjs — #671: Leave is people only; each thing is marked out on its own sheet. 375x812.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-09-leave-people-only';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const auth = { Authorization: `Bearer ${token}` };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const dlg = () => p.getByRole('dialog').last();
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
const res = [];
const check = (name, ok, extra = '') => { res.push([name, ok]); console.log(ok ? 'pass' : 'FAIL', name, extra); };
const made = [];
p.on('response', async (r) => { if (/\/api\/timeoff$/.test(r.url()) && r.request().method() === 'POST' && r.ok()) made.push((await r.json()).id); });

await p.goto(`${APP}/admin/timeoff`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: /^(\+|Add)/ }).first().click(); await p.waitForTimeout(800);
await dlg().getByRole('button', { name: /^Who\b/ }).click(); await p.waitForTimeout(800);
await shot('01-leave-who');
const who = await dlg().innerText();
check('Leave picker lists people only', /THERAPISTS AND DOCTORS/i.test(who) && !/Guest rooms|Therapies|Patients|Closed for a day/i.test(who));
await p.keyboard.press('Escape'); await p.keyboard.press('Escape');

await p.goto(`${APP}/admin/therapies`); await p.waitForTimeout(2000);
await p.getByText('Shirodhara', { exact: true }).first().click(); await p.waitForTimeout(800);
await dlg().getByText('Not given on some days').click(); await p.waitForTimeout(800);
await shot('02-therapy-not-given');
check('therapy sheet opens with the therapy chosen', /Therapy not given/.test(await dlg().innerText()) && /Shirodhara/.test(await dlg().innerText()));
await dlg().getByRole('button', { name: 'Save the days' }).click(); await p.waitForTimeout(1500);
await shot('03-therapy-listed');
check('the day is listed on the therapy sheet', /NOT GIVEN/i.test(await dlg().innerText()));

await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2000);
await p.getByText(/^Day \d+ of \d+/).first().click(); await p.waitForTimeout(2000);
await dlg().getByText('No treatments on these days').scrollIntoViewIfNeeded();
await shot('04-patient-card');
check('patient card offers days with no treatments', (await dlg().getByText('No treatments on these days').count()) === 1);

for (const id of made) await fetch(`${APP}/api/timeoff/${id}`, { method: 'DELETE', headers: auth });
writeFileSync(`${OUT}/README.md`, `# #671 UAT, 9 Oct (demo seed)\n\n| Step | Result |\n|---|---|\n${res.map(([n, ok]) => `| ${n} | ${ok ? 'pass' : 'FAIL'} |`).join('\n')}\n\n![](01-leave-who.png) ![](02-therapy-not-given.png) ![](03-therapy-listed.png) ![](04-patient-card.png)\n`);
await b.close();
process.exit(res.every(([, ok]) => ok) ? 0 : 1);
