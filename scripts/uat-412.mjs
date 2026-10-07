// node scripts/uat-412.mjs — #412: typed search starts with patients, past guests included, at 375x812.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-07-search-patients';
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const lines = [];
const shot = async (id, title, ok, note) => { await p.screenshot({ path: `${OUT}/${id}.png` }); lines.push(`| ${id} | ${title} | ${ok ? 'pass' : 'FAIL'} | ${note} | ![${id}](${id}.png) |`); console.log(id, ok, note); };
const search = async (q) => {
  await p.goto(APP + '/'); await p.waitForTimeout(2000);
  await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(700);
  await p.getByRole('dialog').last().getByRole('button', { name: /^Search/ }).first().click(); await p.waitForTimeout(700);
  await p.keyboard.type(q); await p.waitForTimeout(1500);
};
const group = () => p.locator('section, div').filter({ has: p.getByText('Patients', { exact: true }) }).first();
await search('Ish');
let t = await p.locator('body').innerText();
await shot('01', 'Typing "Ish" shows a Patients section first, with stay facts', /patients/i.test(t) && /In house|Stayed until|Arrives/.test(t), (t.match(/patients[\s\S]{0,160}/i)?.[0] || 'no Patients section').replace(/\n/g, ' · '));
// A past guest: someone whose last stay ended before today.
const pats = await (await fetch(`${APP}/api/appointments/search?q=a&from=2026-06-09&to=2027-02-04`, { headers: { Authorization: `Bearer ${token}` } })).json();
const past = (pats.patients || []).find((x) => x.when === 'past');
if (past) {
  await search(past.name.split(' ')[1] || past.name);
  t = await p.locator('body').innerText();
  await shot('02', `A past guest (${past.name}) is found by name`, t.includes(past.name) && /Stayed until/.test(t), (t.match(/patients[\s\S]{0,160}/i)?.[0] || '').replace(/\n/g, ' · '));
  await p.getByRole('button', { name: new RegExp(past.name) }).first().click(); await p.waitForTimeout(1500);
  t = await p.locator('body').innerText();
  await shot('03', 'Tapping the past guest opens their card', (await p.getByRole('dialog').count()) > 0 && t.includes(past.name), (await p.getByRole('dialog').last().innerText()).split('\n').slice(0, 4).join(' · '));
} else lines.push('| 02 | A past guest | FAIL | none in this seed |  |');
writeFileSync(`${OUT}/README.md`, `# #412 UAT, 7 Oct\n\nBefore (Task B): typed results were treatments only (s15-03), and a past guest's card could not be reached (s34-01).\n\n![before typed](00-before-typed.png) ![before past](00-before-past.png)\n\n| # | Step | Result | Read | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
await b.close();
