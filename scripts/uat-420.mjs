// node scripts/uat-420.mjs — #420: Plan next week on a patient's first day offers a way forward, at 375x812.
// SHOT=00-before against main (:8201), SHOT=01 against the branch. WHO arrives today in the lite seed.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || '01';
const WHO = process.env.WHO || 'Ishita Banerjee';
const OUT = 'docs/design/uat/2026-10-07-first-week';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(APP + '/'); await p.waitForTimeout(2000);
await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(700);
await p.getByRole('dialog').last().getByRole('button', { name: /^Search/ }).first().click(); await p.waitForTimeout(700);
await p.keyboard.type(WHO); await p.waitForTimeout(1500);
await p.getByRole('button', { name: new RegExp(WHO) }).first().click(); await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Plan next week' }).click(); await p.waitForTimeout(2000);
await p.screenshot({ path: `${OUT}/${SHOT}.png` });
const t = await p.getByRole('dialog').last().innerText();
const action = t.split('\n').find((l) => /^Book /.test(l)) || '';
console.log(SHOT, t.replace(/\n/g, ' | ').slice(0, 300));
let after = '';
if (SHOT !== '00-before' && action) {
  await p.getByRole('dialog').last().getByRole('button', { name: action }).click(); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/02.png` });
  after = (await p.getByRole('dialog').last().innerText()).split('\n').slice(0, 3).join(' · ');
  console.log('02', after);
}
if (SHOT !== '00-before') writeFileSync(`${OUT}/README.md`, `# #420 UAT, 7 Oct (lite seed)\n\n${WHO} arrives today; her card's Plan next week is opened.\n\nBefore (main): "Nothing was booked in the seven days up to the review…" and a grey "Nothing ticked".\n\n![before](00-before.png)\n\n| # | Step | Result | Read | Shot |\n|---|---|---|---|---|\n| 01 | The empty sheet says why and offers the first day to book, no grey button | ${action && !t.includes('Nothing ticked') ? 'pass' : 'FAIL'} | ${action} | ![01](01.png) |\n| 02 | That button opens the booking sheet for her on that day | ${after.includes(WHO.split(' ')[0]) || after.includes(WHO) ? 'pass' : 'FAIL'} | ${after} | ![02](02.png) |\n`);
await b.close();
