// node scripts/uat-414.mjs — #414: the Kitchen sheet in the print toast, at 375x812.
// SHOT=00-before against main (:8201), SHOT=01 against the branch. PDFs are drawn to PNG with pdftoppm.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || '01';
const OUT = 'docs/design/uat/2026-10-07-kitchen-sheet';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const pdf = async (view, name) => {
  const r = await fetch(`${APP}/api/daily-schedule-pdf?date=${day}${view ? `&view=${view}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
  writeFileSync(`/tmp/${name}.pdf`, Buffer.from(await r.arrayBuffer()));
  execSync(`pdftoppm -png -r 60 -f 1 -l 1 -singlefile /tmp/${name}.pdf ${OUT}/${name}`);
  return execSync(`pdftotext -layout /tmp/${name}.pdf -`).toString();
};
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(APP + '/'); await p.waitForTimeout(2000);
await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(700);
await p.getByRole('dialog').last().getByRole('button', { name: /^Print/ }).first().click();
await p.getByText(/Patient sheet printed/).waitFor(); await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/${SHOT}-toast.png` });
const toast = await p.getByText(/Patient sheet printed/).locator('..').innerText();
const sheet = await pdf('', `${SHOT}-day-sheet`);
const groups = sheet.split('\n').filter((l) => /— \d+ patients?$/.test(l.trim())).map((l) => l.trim());
console.log(SHOT, 'toast:', toast.replace(/\n/g, ' | '));
console.log(SHOT, 'groups:', groups.join(' / '));
if (SHOT !== '00-before') {
  const kitchen = await pdf('kitchen', '02-kitchen');
  const rows = [
    ['01', 'The print toast offers Kitchen sheet', toast.includes('Kitchen sheet'), toast.replace(/\n/g, ' · '), `${SHOT}-toast.png`],
    ['02', 'Kitchen sheet: one page, counts per plan for each meal, then exceptions by name', /Breakfast .*— \d+/.test(kitchen) && kitchen.includes('Their own'), kitchen.split('\n').find((l) => /^Lunch/.test(l.trim()))?.trim(), '02-kitchen.png'],
    ['03', 'Day sheet: one group per plan and side, own notes by name', new Set(groups).size === groups.length, groups.join(' / '), `${SHOT}-day-sheet.png`],
  ];
  writeFileSync(`${OUT}/README.md`, `# #414 UAT, 7 Oct (lite seed)\n\nBefore (main): the toast offers Therapist and Doctor sheets only, and the day sheet prints a plan twice when one patient's medication differs.\n\n![before toast](00-before-toast.png) ![before sheet](00-before-day-sheet.png)\n\n| # | Step | Result | Read | Shot |\n|---|---|---|---|---|\n${rows.map(([n, s, ok, read, shot]) => `| ${n} | ${s} | ${ok ? 'pass' : 'FAIL'} | ${read} | ![${n}](${shot}) |`).join('\n')}\n`);
  rows.forEach((r) => console.log(r[0], r[2] ? 'pass' : 'FAIL'));
}
await b.close();
