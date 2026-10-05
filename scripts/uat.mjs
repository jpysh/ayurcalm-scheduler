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

const plusBtn = (name) => p.getByRole('button', { name, exact: true });
const back = (name) => p.getByRole('button', { name: `Back to ${name}` });
await step('Day: a filled + (Book a treatment) beside the menu, no ‹, and the Menu no longer repeats Book', '/admin/schedule', async () => {
  const has = await plusBtn('Book a treatment').count();
  const nb = await p.getByRole('button', { name: /^Back to/ }).count();
  await menu();
  const t = await text(dlg());
  return { ok: has === 1 && nb === 0 && !/Book a treatment/.test(t), note: `+ ${has}, ‹ ${nb}; menu: ${t.split('\n').filter(Boolean).slice(0, 6).join(' | ')}` };
});
await step('Day: tapping + opens the booking sheet', '/admin/schedule', async () => {
  await go(plusBtn('Book a treatment'));
  const t = await text(dlg());
  return { ok: /Book|Who|patient/i.test(t), note: t.split('\n').filter(Boolean).slice(0, 4).join(' | ') };
});
await step('Leave: ‹ Day and + Add leave; + opens the sheet; ‹ Day returns to the day', '/admin/timeoff', async () => {
  const had = (await back('Day').count()) === 1 && (await plusBtn('Add leave').count()) === 1;
  await go(plusBtn('Add leave'));
  const sheet = /leave|Who/i.test(await text(dlg()));
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await go(back('Day'));
  const onDay = (await p.getByRole('button', { name: 'Book a treatment', exact: true }).count()) === 1;
  return { ok: had && sheet && onDay, note: `header/+ ${had}, sheet ${sheet}, back on the day ${onDay}` };
});
await step('Patients opened from Leave: ‹ Leave returns to Leave; + is New patient', '/admin/timeoff', async () => {
  await menu(); await go(dlg().getByRole('button', { name: /^Patients/ }));
  const lbl = await back('Leave').count();
  const plus = await plusBtn('New patient').count();
  await go(back('Leave'));
  const onLeave = (await plusBtn('Add leave').count()) === 1;
  return { ok: lbl === 1 && plus === 1 && onLeave, note: `‹ Leave ${lbl}, + ${plus}, back on Leave ${onLeave}` };
});
await step('Team and rooms: + opens the "what are you adding" sheet', '/admin/team', async () => {
  const had = (await back('Day').count()) === 1;
  await go(plusBtn('Add to the team'));
  const t = await text(dlg());
  return { ok: had && /Therapist or doctor/.test(t) && /Room/.test(t), note: t.split('\n').filter(Boolean).slice(0, 5).join(' | ') };
});
await step('Diet plans: ‹ Day and + New diet plan', '/admin/diet', async () => {
  const had = (await back('Day').count()) === 1 && (await plusBtn('New diet plan').count()) === 1;
  return { ok: had, note: `‹ and + present: ${had}` };
});
await step('Settings: ‹ Day, no +', '/admin/settings', async () => {
  const bb = await back('Day').count();
  const pl = await p.locator('nav[data-kit="bar"] button').count();
  return { ok: bb === 1 && pl === 1, note: `‹ ${bb}, bar buttons ${pl} (the menu only)` };
});
await step('Diet plans, scrolled to the end: the last row is clear of + and the menu', '/admin/diet', async () => {
  for (let i = 0; i < 4; i++) { await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(600); }
  const r = await p.evaluate(() => {
    const plus = document.querySelector('nav[data-kit="bar"] button')?.getBoundingClientRect();
    const rows = [...document.querySelectorAll('main button, [role=tabpanel] button')].filter((e) => e.getBoundingClientRect().height > 30);
    const last = rows.map((e) => e.getBoundingClientRect().bottom).filter((v) => v < innerHeight + 5).sort((a, c) => c - a)[0] ?? 0;
    return { plus: plus?.top ?? 0, last };
  });
  return { ok: r.last <= r.plus, note: `last row bottom ${Math.round(r.last)}, + top ${Math.round(r.plus)}` };
});
await b.close();
writeFileSync(`${OUT}/README.md`, `# UAT ${process.argv[2] || ''}\n\nBase ${APP}, 375x812. Written by scripts/uat.mjs.\n\n| # | Step | Result | Read off the page | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
