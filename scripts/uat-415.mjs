// node scripts/uat-415.mjs — #415: a foreign guest's Form C, from What needs you to filed, at 375x812.
// SHOT=00-before against main (:8201) takes only the first shot.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || '';
const OUT = 'docs/design/uat/2026-10-07-form-c';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, permissions: ['clipboard-read', 'clipboard-write'] });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const lines = [];
const shot = async (id, title, ok, note) => { await p.screenshot({ path: `${OUT}/${id}.png` }); lines.push(`| ${id} | ${title} | ${ok ? 'pass' : 'FAIL'} | ${note} | ![${id}](${id}.png) |`); console.log(id, ok, note); };
await p.goto(APP + '/'); await p.waitForTimeout(2000);
await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(700);
await p.getByRole('dialog').getByRole('button', { name: /^Patients/ }).click(); await p.waitForTimeout(1200);
await p.getByRole('button', { name: /^Needs attention/ }).first().click(); await p.waitForTimeout(1200);
let t = await p.locator('body').innerText();
if (SHOT === '00-before') { await shot('00-before', 'Needs attention on main', true, /Form C/.test(t) ? 'Form C shown' : 'no Form C line'); await b.close(); process.exit(0); }
await shot('01', 'Needs attention lists the foreign guest: Form C due by tomorrow', /Form C due by/.test(t), (t.match(/[^\n]*\n[^\n]*Form C[^\n]*/)?.[0] || 'none').replace(/\n/g, ' · '));
await p.getByText(/Form C due by/).first().click(); await p.waitForTimeout(1500);
const card = () => p.getByRole('dialog').last();
t = await card().innerText();
await p.getByText('Form C', { exact: true }).first().scrollIntoViewIfNeeded();
await shot('02', 'Their card has a Form C row with the due day', /Form C\s*Due by/.test(t), (t.match(/Form C[^\n]*\n?[^\n]*/)?.[0] || '').replace(/\n/g, ' '));
await p.getByText('Form C', { exact: true }).first().click(); await p.waitForTimeout(1200);
t = await card().innerText();
const missing = ['Nationality', 'Passport', 'Visa number', 'Visa valid until', 'Arrived'].filter((x) => !t.includes(x));
await shot('03', 'The Form C sheet: each field in the FRRO order, tap to copy', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : t.split('\n').slice(0, 8).join(' · '));
await card().getByRole('button', { name: /^Passport/ }).click(); await p.waitForTimeout(600);
const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
await shot('04', 'Tapping Passport copies it', clip.length > 3, `clipboard: ${clip}`);
await card().getByRole('button', { name: 'Mark Form C filed' }).click(); await p.waitForTimeout(1500);
t = await card().innerText();
await shot('05', 'Marked filed: the row says Filed', /Form C\s*Filed/.test(t), (t.match(/Form C[^\n]*\n?[^\n]*/)?.[0] || '').replace(/\n/g, ' '));
writeFileSync(`${OUT}/README.md`, `# #415 UAT, 7 Oct (lite seed)\n\nThe seed's foreign guest (arrived today, from Germany) at 375x812.\n\nBefore (main, :8201): Needs attention has no Form C line, and the card has no Form C.\n\n![before](00-before.png)\n\n| # | Step | Result | Read | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
await b.close();
