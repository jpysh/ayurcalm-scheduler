// node scripts/uat.mjs <folder> — the session's "check it yourself" steps, done by Claude at 375x812.
// Each step: screenshot + a pass/fail line with what was read off the page. Writes docs/design/uat/<folder>/
// (shots and README.md). Edit STEPS for each session. E2E_BASE_URL defaults to :8080; UAT_EMAIL and
// UAT_PASSWORD default to the demo admin (a trial centre has its own). Never opens the login form.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = `docs/design/uat/${process.argv[2] || new Date().toISOString().slice(0, 10)}`;
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.UAT_EMAIL || 'admin@example.com', password: process.env.UAT_PASSWORD || 'demo1234' }) })).json();
const api = async (m, path, body) => { const r = await fetch(`${APP}/api${path}`, { method: m, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const dlg = () => p.getByRole('dialog').last();
const go = async (l) => { await l.click({ timeout: 5000 }); await p.waitForTimeout(700); };
const lines = [];
let n = 0;
const step = async (title, path, run) => {
  const id = String(++n).padStart(2, '0');
  let ok = false, note = '';
  try { await p.goto(APP + path); await p.waitForTimeout(1500); const r = await run(); ok = r.ok; note = r.note; } catch (e) { note = String(e).split('\n')[0]; }
  await p.screenshot({ path: `${OUT}/${id}.png` });
  lines.push(`| ${id} | ${title} | ${ok ? 'pass' : 'FAIL'} | ${note} | ![${id}](${id}.png) |`);
  console.log(id, ok ? 'pass' : 'FAIL', note);
};
const text = (l) => l.innerText();
// + , search, the pill and change day are rows in the Menu (5 Oct).
const viaMenu = async (name) => { await go(p.getByRole('button', { name: 'Menu', exact: true })); await go(dlg().getByRole('button', { name })); };
const menu = () => go(p.getByRole('button', { name: 'Menu', exact: true }));

await step('Menu on the day: Book is the filled button, Search says Search, no view switch, no "Back to the day"', '/admin/schedule', async () => {
  await menu();
  const t = await text(dlg());
  return { ok: /Book a treatment/.test(t) && /^Search$/m.test(t) && !/Search treatments/.test(t) && !/Show the day by/i.test(t) && !/Back to the day/.test(t), note: t.split('\n').filter(Boolean).slice(0, 8).join(' | ') };
});
await step('The day: a "By time" chip beside the count opens the grouping, and choosing Therapist regroups', '/admin/schedule', async () => {
  await go(p.getByRole('button', { name: /^Show the day by/ }));
  const opts = await text(dlg());
  await go(dlg().getByRole('button', { name: 'Therapist', exact: true }));
  const chip = await p.getByRole('button', { name: /^Show the day by/ }).getAttribute('aria-label');
  return { ok: /Time/.test(opts) && /Room/.test(opts) && /now Therapist/.test(chip), note: chip };
});
await step('Leave: the team\'s leave only, with one row for the centre\'s closed days', '/admin/timeoff', async () => {
  await p.getByRole('button', { name: /^All$/ }).click(); await p.waitForTimeout(500);
  const t = await text(p.locator('body'));
  return { ok: !/Whole centre/.test(t) && /Centre closed days/.test(t), note: (t.match(/Centre closed days\n[^\n]+/) || [''])[0].replace('\n', ' | ') };
});
await step('Centre closed days opens the holidays sheet', '/admin/timeoff', async () => {
  await go(p.getByRole('button', { name: /^Centre closed days/ }));
  const t = await text(dlg());
  return { ok: /holiday|Republic|Diwali|Gandhi|closed/i.test(t), note: t.split('\n').filter(Boolean).slice(0, 5).join(' | ') };
});
await b.close();
writeFileSync(`${OUT}/README.md`, `# UAT ${process.argv[2] || ''}\n\nBase ${APP}, 375x812. Written by scripts/uat.mjs.\n\n| # | Step | Result | Read off the page | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
