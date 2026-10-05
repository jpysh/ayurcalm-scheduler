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

await step('Menu on the day: Book a treatment is the one filled button; no "Back to the day"; Show by is there', '/admin/schedule', async () => {
  await menu();
  const filled = await dlg().locator('button').evaluateAll((bs) => bs.filter((x) => getComputedStyle(x).backgroundColor !== 'rgba(0, 0, 0, 0)' && /Book a treatment/.test(x.textContent)).length);
  const t = await text(dlg());
  return { ok: filled === 1 && !/Back to the day/.test(t) && /show the day by/i.test(t) && /go to/i.test(t), note: `filled Book button ${filled}, order: ${t.split('\n').filter(Boolean).slice(0, 6).join(' | ')}` };
});
await step('Menu on Patients: New patient is the filled button, "Back to the day" is there, no Show by', '/admin/patients', async () => {
  await menu();
  const t = await text(dlg());
  return { ok: /New patient/.test(t) && /Back to the day/.test(t) && !/Show the day by/.test(t), note: t.split('\n').filter(Boolean).slice(0, 4).join(' | ') };
});
await step('Week strip: a rule under it, and the month follows a swipe to another month', '/admin/schedule', async () => {
  const bw = await p.locator('div.sticky.border-b').first().evaluate((e) => getComputedStyle(e).borderBottomWidth);
  const before = await text(p.locator('div.sticky.border-b b').first());
  await p.locator('[aria-label=Week]').evaluate((e) => e.scrollBy({ left: e.clientWidth * 4, behavior: 'instant' })); await p.waitForTimeout(600);
  const after = await text(p.locator('div.sticky.border-b b').first());
  return { ok: bw !== '0px' && before !== after, note: `rule ${bw}; heading ${before} to ${after} after four weeks` };
});
await step('Needs-you row sits above the Book button when something needs fixing', '/admin/schedule', async () => {
  const day = await api('GET', `/appointments?date=${new Date().toISOString().slice(0, 10)}`);
  await menu();
  const t = await text(dlg());
  const hasNeed = /\d+ need you/.test(t);
  return { ok: !hasNeed || t.indexOf('need you') < t.indexOf('Book a treatment'), note: hasNeed ? 'need-you row first' : `nothing needs fixing on the seeded day (${day.length} treatments); info row sits under the actions` };
});
await b.close();
writeFileSync(`${OUT}/README.md`, `# UAT ${process.argv[2] || ''}\n\nBase ${APP}, 375x812. Written by scripts/uat.mjs.\n\n| # | Step | Result | Read off the page | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
