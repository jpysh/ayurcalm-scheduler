// node scripts/uat-review-full.mjs — the full admin review of 21 Oct at 375x812: a new centre set up from nothing,
// then every daily job on the demo centre, and the four printed sheets as PDFs beside the shots.
// Two throwaway stacks, both with ALLOW_DEMO_PASSWORD=true (#1005): DEMO_URL (seeded) and NEW_URL (cleared here).
// Each step's taps are counted and printed; a step that breaks is shot as it broke and the walk goes on.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const DEMO = process.env.DEMO_URL || 'http://localhost:8411';
const NEW = process.env.NEW_URL || 'http://localhost:8412';
const OUT = 'docs/design/uat/2026-10-21-review-full';
mkdirSync(OUT, { recursive: true });
const TZ = 'Asia/Kolkata';
const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: TZ });
const label = (ymd) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');

async function signIn(APP) {
  const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
  const api = (path, body, method) => fetch(`${APP}/api${path}`, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) }).then((r) => (r.headers.get('content-type') || '').includes('json') ? r.json() : r.arrayBuffer());
  return { token, api };
}

const b = await chromium.launch();
const taps = [];
async function phone(APP, token) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: TZ, acceptDownloads: true });
  if (token) await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  return ctx.newPage();
}
let n = 0;
async function step(p, name, walk) {
  let count = 0;
  const tap = async (loc) => { await loc.first().click({ timeout: 8000 }); count++; await p.waitForTimeout(700); };
  const file = `${String(++n).padStart(2, '0')}-${name}`;
  let note = '';
  try { note = (await walk(tap)) || ''; } catch (e) { note = `BROKE: ${e.message.split('\n')[0]}`; }
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `${OUT}/${file}-375.png` });
  taps.push(`${file.padEnd(34)} ${String(count).padStart(2)} taps  ${note}`);
}
const menu = (p, item) => async (tap) => { await tap(p.getByRole('button', { name: 'Menu', exact: true })); await tap(p.getByRole('dialog').getByRole('button', { name: item })); };
const esc = async (p) => { for (let i = 0; i < 4 && (await p.getByRole('dialog').count()); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(400); } };

// ---------- 1. A new centre, from nothing ----------
{
  const { token, api } = await signIn(NEW);
  if ((await api('/therapies')).length) await api('/settings/clear-demo-data', { keep: [] });
  const p = await phone(NEW, token);
  await step(p, 'new-get-started', async () => { await p.goto(`${NEW}/`); await p.waitForTimeout(2000); });
  await step(p, 'new-therapies-library', async (tap) => { await tap(p.getByRole('button', { name: /^Add your therapies/ })); });
  await step(p, 'new-therapies-added', async (tap) => { await tap(p.getByRole('button', { name: /^Add \d+ therap/ })); });
  await step(p, 'new-room-form', async (tap) => {
    await p.goto(`${NEW}/`); await p.waitForTimeout(1500);
    await tap(p.getByRole('button', { name: /^Add your rooms/ }));
  });
  await step(p, 'new-room-added', async (tap) => {
    const d = p.getByRole('dialog').last();
    if (await d.count()) { await d.getByLabel(/name/i).first().fill('Room 1'); await tap(d.getByRole('button', { name: /^Add/ }).last()); }
    else { await tap(p.getByRole('button', { name: /Add (a )?room/ })); await p.getByRole('dialog').last().getByLabel(/name/i).first().fill('Room 1'); await tap(p.getByRole('dialog').last().getByRole('button', { name: /^Add/ }).last()); }
  });
  await step(p, 'new-therapist-form', async (tap) => {
    await p.goto(`${NEW}/`); await p.waitForTimeout(1500);
    await tap(p.getByRole('button', { name: /^Add your therapists/ }));
  });
  await step(p, 'new-therapist-added', async (tap) => {
    let d = p.getByRole('dialog').last();
    if (!(await d.count())) { await tap(p.getByRole('button', { name: /Add (therapist|someone)/ })); d = p.getByRole('dialog').last(); }
    await d.getByLabel(/name/i).first().fill('Lakshmi');
    await tap(d.getByRole('button', { name: /^(Woman|Female)$/ }));
    await tap(d.getByRole('button', { name: /^Add/ }).last());
  });
  await step(p, 'new-day-after-basics', async () => { await p.goto(`${NEW}/`); await p.waitForTimeout(2000); });
  await step(p, 'new-first-guest-form', async (tap) => {
    await p.goto(`${NEW}/admin/patients`); await p.waitForTimeout(1500);
    await tap(p.getByRole('button', { name: /^(New patient|Add your first patient)/ }));
    await p.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Nisha Kapoor');
    await tap(p.getByRole('dialog').getByRole('button', { name: 'Female' }));
  });
  await step(p, 'new-first-guest-added', async (tap) => { await tap(p.getByRole('dialog').getByRole('button', { name: 'Add patient' })); });
  await step(p, 'new-starter-week', async (tap) => {
    await esc(p);
    await p.waitForTimeout(6000); await tap(p.getByRole('button', { name: /^Nisha Kapoor/ }));
    await tap(p.getByRole('button', { name: 'Plan next week' }));
  });
  await step(p, 'new-starter-chosen', async (tap) => { await tap(p.getByRole('dialog').last().getByRole('button', { name: /Back pain|Rejuvenation|Stress/ })); });
  await step(p, 'new-starter-booked', async (tap) => { await tap(p.getByRole('dialog').last().getByRole('button', { name: /^Book all/ })); });
  await p.context().close();
}

// ---------- 2. The demo centre, every daily job ----------
const { token, api } = await signIn(DEMO);
const p = await phone(DEMO, token);
const today = day(0);
const full = day(3);
await step(p, 'day-today', async () => { await p.goto(`${DEMO}/`); await p.waitForTimeout(2500); });
await step(p, 'day-by-therapist', async (tap) => {
  await tap(p.getByRole('button', { name: /^Show the day by/ }));
  await tap(p.getByRole('dialog').getByRole('button', { name: 'Therapist', exact: true }));
});
await step(p, 'day-treatment-card', async (tap) => {
  await tap(p.getByRole('button', { name: /^Show the day by/ }));
  await tap(p.getByRole('dialog').getByRole('button', { name: 'Time', exact: true }));
  await tap(p.locator('[role=tabpanel][data-state=active]').getByRole('button', { name: /^\d\d:\d\d/ }).nth(2));
});
await esc(p);
// Full from: every therapist away from 12:00 three days ahead.
for (const s of (await api('/staff')).filter((s) => s.role !== 'doctor')) await api('/timeoff', { entity_type: 'staff', entity_id: s.id, date: full, start_time: '12:00', end_time: '23:59', description: 'Review: afternoon off', plan: false });
await step(p, 'full-from-week', async (tap) => { await p.goto(`${DEMO}/`); await p.waitForTimeout(2000); await tap(p.getByRole('button', { name: label(full), exact: true })); });
await step(p, 'full-from-booking', async (tap) => { await tap(p.getByRole('button', { name: 'Book a treatment', exact: true })); });
await esc(p);
await step(p, 'book-who', async (tap) => {
  await tap(p.getByRole('button', { name: label(day(1)), exact: true }));
  await tap(p.getByRole('button', { name: 'Book a treatment', exact: true }));
});
await step(p, 'book-therapy', async (tap) => { await tap(p.getByRole('dialog').getByRole('button').filter({ hasText: /Day \d+|in house/i })); });
await step(p, 'book-ready', async (tap) => { await tap(p.getByRole('dialog').getByRole('button', { name: /Same as last time/ })); });
await step(p, 'book-booked', async (tap) => {
  await tap(p.getByRole('dialog').getByRole('button', { name: /^Book / }));
  await p.getByRole('dialog').getByText(/Booked/).first().waitFor({ timeout: 20000 });
});
await esc(p);
// Therapist out tomorrow: the one with the most two-therapist treatments, so the plan has something to say.
const tom = day(1);
const appts = await api(`/appointments?date=${tom}`);
const cnt = new Map();
for (const a of appts) for (const id of [a.staff_id, ...(a.co_staff_ids || [])]) if (id) cnt.set(id, (cnt.get(id) || 0) + (a.co_staff_ids?.length ? 2 : 1));
const staff = await api('/staff');
const out = staff.find((s) => s.id === [...cnt].sort((x, y) => y[1] - x[1])[0][0]);
await step(p, 'out-form', async (tap) => {
  await menu(p, /^Availability/)(tap);
  await tap(p.getByRole('button', { name: 'Mark not available', exact: true }));
  const d = p.getByRole('dialog').last();
  await tap(d.getByRole('button', { name: 'Show staff' }));
  await tap(d.getByRole('checkbox', { name: out.name, exact: true }));
  await tap(d.getByRole('button', { name: /^Next/ }));
  const f = p.getByRole('dialog').last();
  await tap(f.getByRole('button', { name: 'Some days', exact: true }));
  await f.locator('input[type=date]').nth(0).fill(tom);
  await f.locator('input[type=date]').nth(1).fill(tom);
});
await step(p, 'out-plan', async (tap) => {
  await tap(p.getByRole('dialog').last().getByRole('button', { name: /^Save and fix/ }));
  await p.waitForTimeout(4000);
  return `${out.name} out ${tom}`;
});
await step(p, 'out-plan-waiting', async () => { const w = p.getByText('Waiting for you'); if (await w.count()) await w.first().scrollIntoViewIfNeeded(); });
await esc(p);
await step(p, 'closure-part-day', async (tap) => {
  await p.goto(`${DEMO}/admin/timeoff`); await p.waitForTimeout(2000);
  await tap(p.getByRole('button', { name: /Centre closed days/ }));
  await tap(p.getByRole('button', { name: /Close another day/ }));
  await tap(p.getByRole('button', { name: 'Part of a day' }));
});
await esc(p);
// The patient with the most treatments in the coming week, for meals and the course.
const pats = await api('/patients');
const inHouse = pats.filter((x) => (x.Stays || []).some((s) => s.start_date.slice(0, 10) <= today && s.end_date.slice(0, 10) > today));
const guest = inHouse[0];
await step(p, 'meals-card', async (tap) => {
  await p.goto(`${DEMO}/admin/patients`); await p.waitForTimeout(2000);
  await tap(p.getByRole('button', { name: new RegExp('^' + guest.name) }));
});
await step(p, 'meals-diet', async (tap) => { await tap(p.getByRole('dialog').last().getByRole('button', { name: /^Diet/ })); });
await step(p, 'meals-some-days', async (tap) => { await tap(p.getByRole('button', { name: 'Change meals for some days' })); });
await esc(p);
// Purification course: Snehapana in two days, Virechana in five, on a new guest.
let lalita = pats.find((x) => x.name === 'Lalita Rao');
if (!lalita) {
  lalita = await api('/patients', { name: 'Lalita Rao', gender: 'female', stay: { start_date: today, end_date: day(14) } });
  const th = await api('/therapies');
  for (const [nm, k] of [['Snehapana', 2], ['Virechana', 5]]) {
    const t = th.find((x) => x.name === nm);
    if (!t) continue;
    const { suggestions } = await api(`/appointments/suggest?date=${day(k)}&patient_id=${lalita.id}&therapy_id=${t.id}`);
    const s = suggestions?.[0];
    if (s) await api('/appointments/one', { patient_id: lalita.id, therapy_id: t.id, date: day(k), start_time: s.start_time, staff_id: s.staff_id, co_staff_ids: s.co_staff_ids ?? [], room_id: s.room_id, confirm: true });
  }
}
await step(p, 'course-diet-offer', async (tap) => {
  await p.goto(`${DEMO}/admin/patients`); await p.waitForTimeout(2000);
  await tap(p.getByRole('button', { name: /^Lalita Rao/ }));
  await tap(p.getByRole('dialog').last().getByRole('button', { name: /^Diet/ }));
});
await esc(p);
// The therapist's link: an unwell guest, then an SOS, raised as the therapist would.
const ther = staff.find((s) => s.role !== 'doctor' && s.id !== out.id);
const tl = await api(`/staff/${ther.id}/link`, {});
const doc = staff.find((s) => s.role === 'doctor');
const dl = await api(`/staff/${doc.id}/link`, {});
{
  const lp = await phone(DEMO);
  await step(lp, 'therapist-link', async () => { await lp.goto(`${DEMO}/l/${tl.token}`); await lp.waitForTimeout(2500); });
  await step(lp, 'therapist-raise', async (tap) => { await tap(lp.getByRole('button', { name: 'Raise an issue or SOS' })); });
  await step(lp, 'therapist-sos', async (tap) => { await tap(lp.getByRole('button', { name: /SOS: need help now/ })); });
  await lp.context().close();
  const mine = (await api(`/appointments?date=${today}`)).find((a) => a.staff_id === ther.id);
  await fetch(`${DEMO}/api/public/link/${tl.token}/issues`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'unwell', appointment_id: mine?.id }) });
  await fetch(`${DEMO}/api/public/link/${tl.token}/issues`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'sos', note: 'Review walk SOS' }) });
  const dp = await phone(DEMO);
  await step(dp, 'doctor-round', async () => { await dp.goto(`${DEMO}/l/${dl.token}`); await dp.waitForTimeout(2500); });
  await step(dp, 'doctor-round-patient', async (tap) => { await tap(dp.getByRole('button').filter({ hasText: /Day \d+/ })); });
  await dp.context().close();
}
await step(p, 'needs-you-pill', async () => { await p.goto(`${DEMO}/`); await p.waitForTimeout(3000); });
await step(p, 'needs-you-sheet', async (tap) => { await menu(p, /need you/)(tap); });
await esc(p);
await step(p, 'print-menu', async (tap) => {
  await tap(p.getByRole('button', { name: 'Menu', exact: true }));
  const dl = p.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await tap(p.getByRole('dialog').getByRole('button', { name: /^Print (the day's|tomorrow's) sheets/ }));
  return (await dl) ? 'downloaded a PDF' : 'no download';
});
for (const [kind, q] of [['day', ''], ['therapist', '&view=therapist'], ['doctor', '&view=doctor'], ['kitchen', '&view=kitchen']]) {
  const pdf = await api(`/daily-schedule-pdf?date=${today}${q}`);
  writeFileSync(`${OUT}/sheet-${kind}.pdf`, Buffer.from(pdf));
}
await b.close();
writeFileSync(`${OUT}/taps.txt`, taps.join('\n') + '\n');
console.log(taps.join('\n'));
