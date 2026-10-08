// node scripts/uat.mjs <folder> — the session's "check it yourself" steps, done by Claude at 375x812.
// Each step: screenshot + a pass/fail line with what was read off the page. Writes docs/design/uat/<folder>/
// (shots and README.md). Edit STEPS for each session. E2E_BASE_URL defaults to :8080; UAT_EMAIL and
// UAT_PASSWORD default to the demo admin (a trial centre has its own). Never opens the login form.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = `docs/design/uat/${process.argv[2] || new Date().toISOString().slice(0, 10)}`;
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.UAT_EMAIL || 'admin@example.com', password: process.env.UAT_PASSWORD || 'demo1234' }) })).json();
const api = async (m, path, body) => { const r = await fetch(`${APP}/api${path}`, { method: m, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, ...(process.env.UAT_TZ ? { timezoneId: process.env.UAT_TZ } : {}) });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const dlg = () => p.getByRole('dialog').last();
const go = async (l) => { await l.click({ timeout: 5000 }); await p.waitForTimeout(700); };
// UAT_FROM=7 resumes at step 7 on the same centre, keeping the rows already written.
const FROM = Number(process.env.UAT_FROM || 1);
const lines = existsSync(`${OUT}/lines.json`) && FROM > 1 ? JSON.parse(readFileSync(`${OUT}/lines.json`, 'utf8')).slice(0, FROM - 1) : [];
let n = 0;
const step = async (title, path, run) => {
  const id = String(++n).padStart(2, '0');
  if (n < FROM) return;
  let ok = false, note = '';
  try { await p.goto(APP + path); await p.waitForTimeout(1500); const r = await run(); ok = r.ok; note = r.note; } catch (e) { note = String(e).split("\n").slice(0, 3).join(" "); }
  await p.screenshot({ path: `${OUT}/${id}.png` });
  lines.push(`| ${id} | ${title} | ${ok ? 'pass' : 'FAIL'} | ${note} | ![${id}](${id}.png) |`);
  console.log(id, ok ? 'pass' : 'FAIL', note);
};
const text = (l) => l.innerText();
const apiAny = async (m, path, body) => api(m, path, body);
// + , search, the pill and change day are rows in the Menu (5 Oct).
const viaMenu = async (name) => { await go(p.getByRole('button', { name: 'Menu', exact: true })); await go(dlg().getByRole('button', { name })); };
const menu = () => go(p.getByRole('button', { name: 'Menu', exact: true }));

const plusBtn = (name) => p.getByRole('button', { name, exact: true });
const rowBtn = (name) => p.getByRole('button', { name });
const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: process.env.UAT_TZ || 'Asia/Kolkata' });
const day0 = new Date();
const plus = (n) => ymd(new Date(day0.getTime() + n * 86400000));
// Today's hours are over by the afternoon, so the walk books tomorrow: its chip on the week strip.
const tomorrow = async () => { const d = new Date(`${plus(1)}T00:00:00Z`); await go(p.getByRole('button', { name: new RegExp(`^\\w+,? ${d.getUTCDate()} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}$`) })); };
const AM = ['massage_table', 'shower', 'shirodhara_stand', 'steam', 'herbal_paste', 'bp_monitor', 'examination_bed'];

// #576: a foreign guest's own details include the visa, so Form C is whole.
const linkOf = async (id) => (await api('POST', `/patients/${id}/link`)).token;
const mk = async (name, country, id_number) => api('POST', '/patients', { name, gender: 'female', country, id_number, stay: { start_date: plus(0), end_date: plus(10) } });
const guestPage = async (token) => { const c = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true }); const g = await c.newPage(); await g.goto(`${APP}/l/${token}`); await g.waitForTimeout(1500); return { c, g }; };
let foreignId = null;
await step('A foreign guest is asked for the visa; an Indian guest is not', '/admin/schedule', async () => {
  const f = await mk('Uatvisa Foreign', 'Germany', 'C01X00T47'); foreignId = f.id;
  const n = await mk('Uatvisa Indian', 'India', 'P1234567');
  const { c, g } = await guestPage(await linkOf(f.id)); await g.getByText('Your details').click(); await g.waitForTimeout(800);
  const foreignAsks = await g.getByLabel('Visa number').count(); await g.screenshot({ path: `${OUT}/guest-foreign.png` }); await c.close();
  const o = await guestPage(await linkOf(n.id)); await o.g.getByText('Your details').click(); await o.g.waitForTimeout(800);
  const indianAsks = await o.g.getByLabel('Visa number').count(); await o.c.close();
  return { ok: foreignAsks === 1 && indianAsks === 0, note: `visa asked of the German guest: ${foreignAsks}, of the Indian guest: ${indianAsks}` };
});
await step('The visa the guest types is on their Form C', '/admin/patients', async () => {
  const { c, g } = await guestPage(await linkOf(foreignId)); await g.getByText('Your details').click(); await g.waitForTimeout(600);
  const d = g.getByRole('dialog').last();
  await d.getByLabel('Visa number').fill('V4455667'); await d.getByLabel('Visa valid until (yyyy-mm-dd)').fill(plus(200)); await d.getByRole('button', { name: 'Save my details' }).click(); await g.waitForTimeout(1200); await c.close();
  await p.reload(); await p.waitForTimeout(1200); await p.getByRole('button', { name: /Uatvisa Foreign/ }).first().click(); await p.waitForTimeout(1200);
  const row = (await text(dlg())).match(/Form C\n[^\n]*/)?.[0].replace(/\n/g, ' ');
  await go(dlg().getByRole('button', { name: /^Form C/ }));
  const sheet = await text(dlg());
  return { ok: /Visa number\nV4455667/.test(sheet), note: `${row} · sheet: ${sheet.replace(/\n+/g, ' ').match(/Visa number[^|]*?Arrived/)?.[0] ?? sheet.slice(0, 160)}` };
});
await step('The card says how many Form C lines are missing', '/admin/patients', async () => {
  const x = await mk('Uatvisa Missing', 'Italy', '');
  await p.reload(); await p.waitForTimeout(1200); await p.getByRole('button', { name: /Uatvisa Missing/ }).first().click(); await p.waitForTimeout(1200);
  const row = (await text(dlg())).match(/Form C\n[^\n]*/)?.[0].replace(/\n/g, ' ');
  return { ok: /missing/.test(row || ''), note: row || 'no Form C row' };
});
await b.close();

writeFileSync(`${OUT}/lines.json`, JSON.stringify(lines));
writeFileSync(`${OUT}/README.md`, `# UAT ${process.argv[2] || ''}\n\nBase ${APP}, 375x812. Written by scripts/uat.mjs.\n\n| # | Step | Result | Read off the page | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
