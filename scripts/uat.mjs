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

// #622: a pair that changed members says so as a team.
await step('A treatment of two therapists whose second changes reads "Therapists changed from A and B to A and C" in History', '/admin/schedule', async () => {
  const tag = String(Date.now()).slice(-5);
  const ther = await api('POST', '/therapies', { name: `Uat Pair ${tag}`, duration_minutes: 45, staff_required: 2, required_amenities: [] });
  const mk = (n) => api('POST', '/staff', { name: n, gender: 'female', role: 'therapist', specializations: [ther.id] });
  const [p1, p2, p3] = [await mk(`Uatpa${tag}`), await mk(`Uatpb${tag}`), await mk(`Uatpc${tag}`)];
  const room = await api('POST', '/rooms', { name: `Uat pair room ${tag}`, amenities: [] });
  const guest = await api('POST', '/patients', { name: `Uatpair ${tag}`, gender: 'female', stay: { start_date: plus(0), end_date: plus(5) } });
  const made = await api('POST', '/appointments/one', { patient_id: guest.id, therapy_id: ther.id, date: plus(1), start_time: '10:00', staff_id: p1.id, co_staff_ids: [p2.id], room_id: room.id });
  await api('PUT', `/appointments/${made.id}`, { co_staff_ids: [p3.id] });
  const history = (await api('GET', `/appointments/${made.id}/history`));
  const line = (history.entries || []).map((h) => h.text).find((t) => /Therapist/.test(t)) || 'none';
  await p.goto(APP + '/admin/schedule'); await p.waitForTimeout(1500);
  const d1 = new Date(`${plus(1)}T00:00:00Z`);
  await p.getByRole('button', { name: /week ›/ }).click({ timeout: 1500 }).catch(() => {}); await p.waitForTimeout(500);
  await go(p.getByRole('button', { name: new RegExp(`^\\w+,? ${d1.getUTCDate()} ${d1.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}$`) }));
  await go(p.getByRole('button', { name: new RegExp(`Uatpair ${tag}`) }).first());
  const card = (await text(dlg())).replace(/\n+/g, ' | ');
  const want = `Therapists changed from Uatpa${tag} and Uatpb${tag} to Uatpa${tag} and Uatpc${tag}`;
  return { ok: line === want && card.includes(want), note: `history: ${line}` };
});
await b.close();

writeFileSync(`${OUT}/lines.json`, JSON.stringify(lines));
writeFileSync(`${OUT}/README.md`, `# UAT ${process.argv[2] || ''}\n\nBase ${APP}, 375x812. Written by scripts/uat.mjs.\n\n| # | Step | Result | Read off the page | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
