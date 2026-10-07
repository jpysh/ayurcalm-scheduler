// node scripts/uat-419.mjs — #419: Snehapana booked after the stay's Virechana is asked about, at 375x812.
// SHOT=00-before against main (:8201), SHOT=01 against the branch. Reads only: nothing is booked.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || '01';
const WHO = 'Meera Khan'; // the lite seed's patient in samsarjana, after her Virechana
const OUT = 'docs/design/uat/2026-10-07-before-purification';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(APP + '/'); await p.waitForTimeout(2000);
await p.getByRole('button', { name: 'Book a treatment', exact: true }).click();
const sheet = p.getByRole('dialog');
await sheet.getByLabel('Search patients').fill(WHO);
await sheet.getByRole('button', { name: new RegExp(`^${WHO}`) }).first().click();
await sheet.getByRole('button', { name: /^Other therapies/ }).click();
await p.getByPlaceholder('Search therapies').fill('Snehapana');
await p.getByRole('dialog').last().getByRole('button', { name: /^Snehapana/ }).click();
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/${SHOT}.png` });
const t = await sheet.first().innerText();
const line = t.split('\n').find((l) => /prepares for a purification/.test(l)) || '';
const book = t.split('\n').find((l) => /^Book /.test(l)) || '';
console.log(SHOT, line || 'no warning', '|', book);
if (SHOT !== '00-before') writeFileSync(`${OUT}/README.md`, `# #419 UAT, 7 Oct (lite seed)\n\nBooking sheet, today, ${WHO} (after her Virechana), Snehapana chosen. Nothing is booked.\n\nBefore (main): no warning; the button reads "${process.env.BEFORE_BOOK || 'Book …'}".\n\n![before](00-before.png)\n\n| # | Step | Result | Read | Shot |\n|---|---|---|---|---|\n| 01 | The sheet warns Snehapana is after the purification, booking still possible | ${line && /Book anyway/.test(book) ? 'pass' : 'FAIL'} | ${line} · ${book} | ![01](01.png) |\n`);
await b.close();
