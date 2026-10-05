// node scripts/uat-330.mjs <folder> — booking from + (#330), at 375x812 on E2E_BASE_URL (default :8080).
// Seeds its own "Uat" people and therapies through the API, then walks each case and screenshots it.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = `docs/design/uat/${process.argv[2] || 'booking'}`;
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = async (m, path, body) => { const r = await fetch(`${APP}/api${path}`, { method: m, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const plus = (n) => ymd(new Date(Date.now() + n * 86400000));
const allWeek = Object.fromEntries(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]));

// ---- seed: tomorrow is the day the walk books on; today's hours are over by evening.
const run = Date.now().toString(36).slice(-3);
const therapies = await api('GET', '/therapies');
const by = (n) => therapies.find((t) => t.name === n);
const person = (name, gender = 'female') => api('POST', '/patients', { name: `${name} Uat${run}`, gender, stay: { start_date: plus(0), end_date: plus(13) } });
const [meera, dev] = [await person('Meera'), await person('Dev', 'male')];
const vamana = await api('POST', '/therapies', { name: `Uat Vamana ${run}`, duration_minutes: 60, staff_required: 2, requires_gender_match: true });
await api('POST', '/staff', { name: `Uat Ravi ${run}`, gender: 'male', specializations: [vamana.id], weekly_schedule: allWeek });
await api('POST', '/staff', { name: `Uat Asha ${run}`, gender: 'female', specializations: [vamana.id], weekly_schedule: allWeek });
const long = await api('POST', '/therapies', { name: `Uat Longday ${run}`, duration_minutes: 60, staff_required: 1 });
const solo = await api('POST', '/staff', { name: `Uat Solo ${run}`, gender: 'female', specializations: [long.id], weekly_schedule: allWeek });
await api('POST', '/timeoff', { entity_type: 'staff', entity_id: solo.id, date: plus(1), description: 'Uat: away' }); // the one therapist who gives it is away tomorrow
const book = async (patient, therapy, date) => {
  const o = await api('GET', `/appointments/options?date=${date}&patient_id=${patient.id}&therapy_id=${therapy.id}`);
  const t = o.times[0]; if (!t) throw new Error(`no time for ${therapy.name} on ${date}: ${JSON.stringify(o).slice(0, 200)}`);
  return api('POST', '/appointments/one', { patient_id: patient.id, therapy_id: therapy.id, date, start_time: t.start_time, staff_id: t.staff_id, co_staff_ids: t.co_staff_ids, room_id: t.room_id, confirm: true });
};
// Plain one-therapist therapies somebody here gives, with a time tomorrow: the demo's therapists are trained for some only.
const free = [];
for (const t of therapies.filter((x) => !x.is_consultation && x.duration_minutes <= 45 && x.staff_required === 1 && !x.requires_gender_match)) {
  if ((await api('GET', `/appointments/options?date=${plus(1)}&patient_id=${dev.id}&therapy_id=${t.id}`)).times?.length) free.push(t.name);
  if (free.length === 6) break;
}
for (const n of free.slice(0, 4)) await book(dev, by(n), plus(1)); // four already: the fifth is over the limit
const [A, B] = [free[4], free[5]]; // A: Meera's first (and Dev's fifth), B: her second

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const dlg = () => p.getByRole('dialog').last();
const go = async (l) => { await l.click({ timeout: 6000 }); await p.waitForTimeout(900); };
const d1 = new Date(`${plus(1)}T00:00:00Z`);
const tomorrow = async () => { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(500); await go(p.getByRole('button', { name: new RegExp(`^\\w+,? ${d1.getUTCDate()} ${d1.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}$`) })); };
const open = async (onTomorrow = true) => { await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(1500); if (onTomorrow) await tomorrow(); await go(p.getByRole('button', { name: 'Book a treatment', exact: true })); };
const who = async (patient) => { await dlg().getByLabel('Search patients').fill(patient.name); await p.waitForTimeout(400); await go(dlg().getByRole('button', { name: new RegExp(`^${patient.name}`) }).first()); };
const therapy = async (name) => { await go(dlg().getByRole('button', { name: /^Other therapies/ })); await p.getByPlaceholder('Search therapies').fill(name); await p.waitForTimeout(300); await go(p.getByRole('dialog').last().getByRole('button', { name: new RegExp(`^${name}`) }).first()); await p.waitForTimeout(1200); };
const text = () => dlg().innerText();
const shot = (id) => p.screenshot({ path: `${OUT}/${id}.png` });
const lines = [];
let n = 0;
const step = async (title, fn) => {
  const id = String(++n).padStart(2, '0');
  let ok = false, note = '';
  try { const r = await fn(id); ok = r.ok; note = r.note; } catch (e) { note = String(e).split('\n').slice(0, 3).join(' '); }
  await shot(id);
  lines.push(`| ${id} | ${title} | ${ok ? 'pass' : 'FAIL'} | ${note} | ![${id}](${id}.png) |`);
  console.log(id, ok ? 'pass' : 'FAIL', note);
};
const flat = (s) => s.replace(/\s+/g, ' ').slice(0, 160);

await step('Open + and choose Meera: no therapy is chosen, the list shows facts, Book says Choose a therapy', async () => {
  await open(); await who(meera);
  const t = await text();
  const disabled = await dlg().getByRole('button', { name: 'Choose a therapy' }).isDisabled();
  return { ok: disabled && /Choose a therapy/.test(t) && !/Book Meera/.test(t), note: flat(t) };
});
await step(`Choose ${A}: the best time, therapist and room fill in; Days in a row has chips`, async () => {
  await therapy(A);
  const t = await text();
  return { ok: /Days in a row/.test(t) && /One a day|One treatment/.test(t) && /Book Meera/.test(t), note: flat(t) };
});
await step('Book: the sheet stays on Booked with Add another, Done and Undo (the note with Undo comes when it closes)', async () => {
  await go(dlg().getByRole('button', { name: /^Book Meera/ }));
  const t = await text();
  return { ok: /Booked/.test(t) && /Add another/.test(t) && /has 1/.test(t) && /Undo/.test(t), note: flat(t) };
});
await step(`Add another: the same patient, no therapy chosen; ${A} is greyed "already at"; choosing it warns`, async () => {
  await go(dlg().getByRole('button', { name: 'Add another' }));
  const list = await text();
  await go(dlg().getByRole('button', { name: new RegExp(`^${A}`) }));
  await p.waitForTimeout(1500);
  const t = await text();
  return { ok: /already at/.test(list) && /already has/.test(t) && /Book anyway/.test(t), note: `${flat(list)} || ${flat(t)}` };
});
await step('A different therapy, booked: the day now has 2', async () => {
  await go(dlg().getByRole('button', { name: /^Therapy/ }));
  await therapy(B);
  await go(dlg().getByRole('button', { name: /^Book Meera/ }));
  const t = await text();
  return { ok: /has 2/.test(t), note: flat(t) };
});
await step('Over the limit: Dev already has 4 tomorrow; the fifth shows the warning and Book anyway', async () => {
  await go(dlg().getByRole('button', { name: 'Done' }));
  await open(); await who(dev); await therapy(A);
  const t = await text();
  return { ok: /already has 4 treatments/.test(t) && /Book anyway/.test(t), note: flat(t) };
});
await step('Book anyway: it books, and the panel says Dev has 5', async () => {
  await go(dlg().getByRole('button', { name: /^Book anyway/ }));
  const t = await text();
  return { ok: /has 5/.test(t), note: flat(t) };
});
await step('Dead end, not staying: the stay is named, with a day to go to and Change their stay', async () => {
  await go(dlg().getByRole('button', { name: 'Done' }));
  await open(); await who(meera); await therapy(A);
  await dlg().getByLabel('Date', { exact: true }).fill(plus(40)); await p.waitForTimeout(1500);
  const t = await text();
  return { ok: /Their stay runs/.test(t) && /Go to/.test(t) && /Change their stay/.test(t), note: flat(t) };
});
await step('Change their stay: one tap opens the stay sheet over the booking (#343)', async () => {
  await go(dlg().getByRole('button', { name: 'Change their stay' }));
  const t = await text();
  return { ok: /Stay for Meera/i.test(t) && /Leaving/i.test(t), note: flat(t) };
});
await step('Leaving moved past that day and saved: back on the booking, that day now bookable', async () => {
  await dlg().getByLabel('Leaving').fill(plus(41)); await p.waitForTimeout(500);
  await go(dlg().getByRole('button', { name: /^Stay until/ })); await p.waitForTimeout(1500);
  const t = await text();
  return { ok: /^Book Meera,/m.test(t) && !/Their stay runs/.test(t) && !/Stay for Meera/i.test(t), note: flat(t) };
});
await step('Dead end, no free time: the next free day is one tap', async () => {
  await open(); await who(meera); await therapy(`Uat Longday ${run}`);
  const t = await text();
  return { ok: /No free time/.test(t) && /Book .* at \d\d:\d\d/.test(t) && /Try another therapy/.test(t), note: flat(t) };
});
await step("Dead end, today's hours are over: Book tomorrow", async () => {
  await open(false); await who(meera); await therapy(A);
  const t = await text();
  return { ok: /hours are over/.test(t) && /Book tomorrow/.test(t), note: flat(t) };
});
await step('Dead end, not enough therapists of her gender: add one, or allow any gender', async () => {
  await open(); await who(meera); await therapy(`Uat Vamana ${run}`);
  const t = await text();
  return { ok: /needs 2 therapists/.test(t) && /Add a female therapist/.test(t) && /Allow any gender/.test(t), note: flat(t) };
});
await step('Add a female therapist opens the form with Female and the therapy filled in', async () => {
  await go(dlg().getByRole('button', { name: /^Add a female therapist/ }));
  const female = await p.getByRole('dialog').last().getByRole('button', { name: 'Female', exact: true }).getAttribute('aria-pressed');
  return { ok: female === 'true', note: flat(await text()) };
});
await step('Allow any gender: a time appears', async () => {
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);
  await go(dlg().getByRole('button', { name: /^Allow any gender/ }));
  await p.waitForTimeout(1500);
  const t = await text();
  return { ok: /Book Meera/.test(t) && !/Allow any gender/.test(t), note: flat(t) };
});
await step('New patient inline: nobody matches, so the name is offered as a new patient', async () => {
  await open(); await dlg().getByLabel('Search patients').fill(`Zed Uat${run}`); await p.waitForTimeout(500);
  const t = await text();
  return { ok: /as a new patient/.test(t), note: flat(t) };
});
await step('The short form has the name filled in and no consultation to choose', async () => {
  await go(dlg().getByRole('button', { name: /as a new patient/ }));
  const t = await text();
  return { ok: new RegExp(`Zed Uat${run}`).test(await dlg().getByLabel('Name').inputValue()) && !/First consultation/.test(t), note: flat(t) };
});
await step('Add: back on the booking with Zed chosen and the therapy list', async () => {
  await go(dlg().getByRole('button', { name: 'Female', exact: true }));
  await go(dlg().getByRole('button', { name: new RegExp(`^Add Zed Uat${run}`) }));
  await p.waitForTimeout(1200);
  const t = await text();
  return { ok: new RegExp(`Zed Uat${run}`).test(t) && /Choose a therapy/.test(t), note: flat(t) };
});

writeFileSync(`${OUT}/README.md`, `# UAT booking from + (#330)\n\nBase ${APP}, 375x812. Written by scripts/uat-330.mjs; it seeds its own "Uat" people and therapies. The hours-over step needs the centre's clock past closing.\n\n| # | Step | Result | Read off the page | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
await b.close();
