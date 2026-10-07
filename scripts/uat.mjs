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
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
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
const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const day0 = new Date();
const plus = (n) => ymd(new Date(day0.getTime() + n * 86400000));
// Today's hours are over by the afternoon, so the walk books tomorrow: its chip on the week strip.
const tomorrow = async () => { const d = new Date(`${plus(1)}T00:00:00Z`); await go(p.getByRole('button', { name: new RegExp(`^\\w+,? ${d.getUTCDate()} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}$`) })); };
const AM = ['massage_table', 'shower', 'shirodhara_stand', 'steam', 'herbal_paste', 'bp_monitor', 'examination_bed'];

// #460: a consultation with no doctor names a doctor, and its fix adds one.
const doctors = (await api('GET', '/staff')).filter((x) => x.role === 'doctor' && x.is_active !== false);
const someone = (await api('GET', '/patients')).find((x) => x.name);
const bookConsult = async () => {
  await go(p.getByRole('button', { name: 'Book a treatment', exact: true }));
  await go(dlg().getByRole('button', { name: /^Aarohi Das/ }).first());
  await go(dlg().getByRole('button', { name: /Other therapies/ }));
  await go(p.getByRole('dialog').last().getByText('Consultation', { exact: true }).first());
  await p.waitForTimeout(1500);
};
await step('No doctor in: booking a consultation says it needs a doctor, with Add a doctor', '/admin/schedule', async () => {
  for (const d of doctors) await api('PUT', `/staff/${d.id}`, { is_active: false });
  await p.reload(); await p.waitForTimeout(2000);
  await bookConsult();
  const t = await text(dlg());
  return { ok: /needs a doctor/.test(t) && /Add a doctor/.test(t), note: t.split('\n').filter((x) => /needs|Add a/.test(x)).join(' · ') };
});
await step('Add a doctor opens the form with Doctor chosen', '/admin/schedule', async () => {
  await bookConsult();
  await go(dlg().getByRole('button', { name: 'Add a doctor' }));
  const pressed = await dlg().getByRole('radio', { name: 'Doctor' }).getAttribute('aria-checked').catch(() => null) ?? await dlg().getByRole('button', { name: 'Doctor', exact: true }).getAttribute('aria-pressed').catch(() => null);
  return { ok: pressed === 'true', note: `Doctor chosen: ${pressed}` };
});
await step('With a doctor in, the booking line reads Doctor', '/admin/schedule', async () => {
  for (const d of doctors) await api('PUT', `/staff/${d.id}`, { is_active: true });
  await p.reload(); await p.waitForTimeout(2000); await bookConsult();
  await dlg().getByRole('button', { name: /Book tomorrow/ }).click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(1500);
  const t = await text(dlg());
  return { ok: /\nDoctor\n/.test(t) && !/\nTherapist\n/.test(t), note: t.split('\n').filter((x) => /^(Doctor|Therapist|Room)$/.test(x)).join(' · ') };
});
await b.close();

writeFileSync(`${OUT}/lines.json`, JSON.stringify(lines));
writeFileSync(`${OUT}/README.md`, `# UAT ${process.argv[2] || ''}\n\nBase ${APP}, 375x812. Written by scripts/uat.mjs.\n\n| # | Step | Result | Read off the page | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
