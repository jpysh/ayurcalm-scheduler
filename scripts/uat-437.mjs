// node scripts/uat-437.mjs — #437: a past guest's card says when they left and offers New stay, at 375x812.
// SHOT=00-before against main (:8201), SHOT=01 against the branch (also taps New stay: 02).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || '01';
const OUT = 'docs/design/uat/2026-10-07-past-guest-card';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const pats = await (await fetch(`${APP}/api/appointments/search?q=a&from=2026-06-09&to=2027-02-04`, { headers: { Authorization: `Bearer ${token}` } })).json();
const past = (pats.patients || []).find((x) => x.when === 'past');
if (!past) { console.log('no past guest in this seed'); process.exit(1); }
await p.goto(APP + '/'); await p.waitForTimeout(2000);
await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(700);
await p.getByRole('dialog').last().getByRole('button', { name: /^Search/ }).first().click(); await p.waitForTimeout(700);
await p.keyboard.type(past.name); await p.waitForTimeout(1500);
await p.getByRole('button', { name: new RegExp(past.name) }).first().click(); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/${SHOT}.png` });
const card = await p.getByRole('dialog').last().innerText();
const ok = /Stayed until/.test(card) && /New stay/.test(card) && !/Nothing booked/.test(card);
console.log(SHOT, past.name, ok ? 'pass' : 'fail', card.split('\n').slice(0, 6).join(' · '));
if (SHOT !== '00-before') {
  await p.getByRole('button', { name: /New stay/ }).first().click(); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/02.png` });
  const sheet = (await p.getByRole('dialog').last().innerText()).split('\n').slice(0, 8).join(' · ');
  console.log('02', sheet);
  writeFileSync(`${OUT}/README.md`, `# #437 UAT, 7 Oct (lite seed)\n\nA past guest (${past.name}) opened from search, at 375x812.\n\nBefore (main): Next days, each in red 'Nothing booked'.\n\n![before](00-before.png)\n\n| # | Step | Result | Shot |\n|---|---|---|---|\n| 01 | The card says when they left; no Next days; a New stay row | ${ok ? 'pass' : 'FAIL'} | ![01](01.png) |\n| 02 | New stay opens the stay sheet from today, on their last package when they had one | read | ![02](02.png) |\n`);
}
await b.close();
