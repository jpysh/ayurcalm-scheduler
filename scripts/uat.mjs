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

// #523: a patient with no review booked can still plan next week from today.
const nm = `Review Less ${Date.now() % 1000}`;
const th = await api('GET', '/therapies'); const pt = await api('POST', '/patients', { name: nm, gender: 'male' });
await api('POST', `/patients/${pt.id}/stays`, { start_date: plus(-3), end_date: plus(9) });
const early = new Date(Date.now() - 4 * 86400000).toISOString();
// The first therapy that has a free time on both of the last two days: the seeded week is busy for some.
let abh = null; const made = { success: false };
for (const t of th.filter((x) => !x.is_consultation && (x.staff_required ?? 1) === 1)) {
  const r = await Promise.all([-2, -1].map((d) => api('POST', '/appointments', { patient_id: pt.id, therapy_id: t.id, total_sessions: 1, preferred_time_range: { start: '09:00', end: '18:00' }, start_date: plus(d), end_date: plus(d), now: early })));
  if (r.every((x) => x.success)) { abh = t; made.success = true; break; }
}
await step('A patient with no review booked has Plan next week', '/admin/patients', async () => {
  await go(p.getByText(nm).first()); await p.waitForTimeout(900);
  const t = await text(dlg());
  return { ok: /Plan next week/.test(t) && /None booked/.test(t), note: `${made.success} · ` + t.split('\n').filter((x) => /Next|Plan|Review|None/.test(x)).slice(0, 5).join(' · ') };
});
await step('It repeats the week they had', '/admin/patients', async () => {
  await go(p.getByText(nm).first()); await go(dlg().getByRole('button', { name: 'Plan next week' })); await p.waitForTimeout(1500);
  const t = await text(dlg());
  return { ok: t.includes(abh.name) && /2 days/.test(t) && /Book all/.test(t), note: t.split('\n').filter((x) => x.trim()).slice(0, 12).join(' · ') };
});
await step('Book all books them, with one Undo', '/admin/patients', async () => {
  await go(p.getByText(nm).first()); await go(dlg().getByRole('button', { name: 'Plan next week' })); await p.waitForTimeout(1500);
  await go(dlg().getByRole('button', { name: /^Book all/ })); await p.waitForTimeout(1500);
  const toast = await p.locator('[data-sonner-toast]').first().innerText().catch(() => '');
  return { ok: /Booked \d+ treatment/.test(toast) && /Undo/.test(toast), note: toast.replace(/\n/g, ' · ') };
});
await b.close();

writeFileSync(`${OUT}/lines.json`, JSON.stringify(lines));
writeFileSync(`${OUT}/README.md`, `# UAT ${process.argv[2] || ''}\n\nBase ${APP}, 375x812. Written by scripts/uat.mjs.\n\n| # | Step | Result | Read off the page | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
