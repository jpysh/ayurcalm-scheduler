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
const iso = (add = 0) => new Date(Date.now() + add * 86400000).toISOString().slice(0, 10);
const bookFor = async (who) => { await go(p.getByRole('button', { name: /^(New|Book|Add)/ }).last()); await go(dlg().getByRole('button', { name: new RegExp(`^${who}`) }).first()); };
const stay = (name, gender) => api('POST', '/patients', { name, gender, stay: { start_date: iso(), end_date: iso(13) } });
const ravi = await stay('Ravi Kumar', 'male');
const sunita = await stay('Sunita Rao', 'female');

await step('Team: "This week" counts hours for a team whose hours were never set', '/admin/team', async () => {
  const t = await text(p.locator('body'));
  const m = t.match(/(\d+)h booked of (\d+)h/);
  return { ok: !!m && Number(m[2]) > 0, note: m ? m[0] : 'no hours line' };
});
await step('New patient: a doctor is free, so the consultation is pre-booked (no "No doctor is free")', '/admin/patients', async () => {
  await go(p.getByRole('button', { name: 'New patient' }));
  await dlg().getByLabel('Name').fill('Meera Nair'); await dlg().getByRole('button', { name: 'Female', exact: true }).click(); await p.waitForTimeout(1200);
  const warned = /No doctor is free/.test(await text(dlg()));
  await go(dlg().getByRole('button', { name: /^Add Meera/ })); await p.waitForTimeout(1500);
  const card = await text(dlg());
  return { ok: !warned && !/None booked · book one/.test(card), note: `${warned ? 'warned no doctor' : 'no warning'}; card: ${(card.match(/Next\n([^\n]+)/) || [])[1]}` };
});
await step('A resident with no consultation: "book one" opens the sheet on Consultation', '/admin/patients', async () => {
  await go(p.getByRole('button', { name: /^Ravi/ }).first());
  await go(dlg().getByRole('button', { name: /^Next/ }));
  const t = (await text(dlg())).match(/Therapy\n([^\n]+)/)?.[1] || '';
  return { ok: /Consultation/.test(t), note: `Therapy line reads ${t}` };
});
await step('Booking sheet, 40 therapies: the Therapy line is a search (type "shiro")', '/admin/schedule', async () => {
  await bookFor('Ravi'); await go(dlg().getByRole('button', { name: /^Therapy/ }));
  await dlg().getByPlaceholder('Search therapies').fill('shiro'); await p.waitForTimeout(500);
  const rows = await dlg().getByRole('button').allInnerTexts();
  const hit = rows.filter((r) => /^Shiro/.test(r)).length;
  await p.screenshot({ path: `${OUT}/04-search.png` });
  await go(dlg().getByRole('button', { name: /^Shirodhara/ }));
  const line = await text(p.getByRole('dialog').last());
  return { ok: hit === 2 && /Therapy\s*\n?\s*Shirodhara/.test(line), note: `${hit} rows for "shiro" (04-search.png); Therapy line then reads Shirodhara` };
});
await step('Two-therapist therapy: both women are offered, no "needs 2 therapists and has 1"', '/admin/schedule', async () => {
  await bookFor('Sunita');
  if (await dlg().getByRole('button', { name: /^Therapy/ }).count()) { await go(dlg().getByRole('button', { name: /^Therapy/ })); await dlg().getByPlaceholder('Search therapies').fill('abhyanga'); await go(dlg().getByRole('button', { name: /^Abhyanga/ })); }
  await p.waitForTimeout(1200);
  const opts = await dlg().getByLabel('Therapist').evaluate((s) => [...s.options].map((o) => o.text));
  return { ok: !opts.some((o) => /needs 2 therapists/.test(o)), note: opts.map((o) => o.slice(0, 40)).join(' | ') };
});
// Tara takes the only two women therapists first, so Sunita's best time falls on a quarter hour, not a half.
const tara = await stay('Tara Das', 'female');
const abh = (await api('GET', '/therapies')).find((t) => t.name === 'Abhyanga');
const hhmm = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(11, 16);
const first = (await api('GET', `/appointments/options?date=${iso()}&patient_id=${tara.id}&therapy_id=${abh.id}&now=${hhmm}`)).times[0];
await api('POST', '/appointments/one', { patient_id: tara.id, therapy_id: abh.id, date: iso(), start_time: first.start_time, staff_id: first.staff_id, co_staff_ids: first.co_staff_ids, room_id: first.room_id });
let promised = '';
await step('A five-day course starts at the time the sheet and the toast promise', '/admin/schedule', async () => {
  await bookFor('Sunita');
  await go(dlg().getByRole('button', { name: /^Therapy/ })); await dlg().getByPlaceholder('Search therapies').fill('abhyanga'); await go(dlg().getByRole('button', { name: /^Abhyanga/ }));
  await dlg().getByLabel('Sessions').selectOption({ label: '5 sessions, one a day' }); await p.waitForTimeout(1500);
  promised = await dlg().getByLabel('Time').evaluate((s) => s.options[s.selectedIndex].text.slice(0, 5));
  await go(dlg().getByRole('button', { name: /^Book Sunita/ })); await p.waitForTimeout(2000);
  const day = await api('GET', `/appointments?date=${iso()}`);
  const mine = day.find((a) => a.patient_id === sunita.id) || (await api('GET', `/appointments?date=${iso(1)}`)).find((a) => a.patient_id === sunita.id);
  return { ok: !!mine && mine.start_time === promised, note: `sheet promised ${promised}, booked ${mine?.start_time}` };
});
await step('Replan after a leave: the moved session never doubles a day of the same course', '/admin/schedule', async () => {
  const appts = await api('GET', `/appointments?date=${iso(1)}`);
  const hers = appts.find((a) => a.patient_id === sunita.id);
  await api('POST', '/timeoff', { entity_type: 'staff', entity_id: hers.staff_id, date: iso(1), start_date: iso(1), end_date: iso(1), description: 'Leave' });
  await p.reload(); await p.waitForTimeout(1500);
  await go(p.getByRole('button', { name: 'Next day' }).first()); await p.waitForTimeout(800);
  await go(p.getByRole('button', { name: /need you/ }));
  const moves = dlg().getByRole('button', { name: /^\w{3} \d+ \w{3}, \d\d:\d\d/ });
  const first = (await moves.first().innerText()).split('\n')[0];
  await go(moves.first()); await p.waitForTimeout(1500);
  const perDay = new Map();
  for (let d = 0; d < 14; d++) for (const a of await api('GET', `/appointments?date=${iso(d)}`)) if (a.patient_id === sunita.id && a.therapy_id === hers.therapy_id && a.status !== 'cancelled') perDay.set(iso(d), (perDay.get(iso(d)) || 0) + 1);
  const dup = [...perDay.entries()].filter(([, c]) => c > 1);
  return { ok: !dup.length, note: `moved to "${first}"; days with two: ${dup.length ? dup.map(([d]) => d).join(', ') : 'none'}` };
});
await step('Leave toast says who is away and when', '/admin/team', async () => {
  await go(p.getByRole('button', { name: /^Dev/ })); await go(dlg().getByRole('button', { name: /^Away another day/ })); await go(dlg().getByRole('button', { name: /^Mark leave/ })); await p.waitForTimeout(1200);
  const toast = await text(p.locator('[data-sonner-toast]').first());
  return { ok: /^Dev away /.test(toast), note: toast.split('\n')[0] };
});
await b.close();
writeFileSync(`${OUT}/README.md`, `# UAT ${process.argv[2] || ''}\n\nBase ${APP}, 375x812. Written by scripts/uat.mjs.\n\n| # | Step | Result | Read off the page | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
