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

await step('Get started on a new trial: four rows and a plain next step', '/admin/schedule', async () => {
  const t = await text(p.locator('body'));
  return { ok: /Add your therapies/.test(t) && /Add your rooms/.test(t) && /Add your therapists/.test(t) && /Add your first patient/.test(t) && /tap \+ to book/.test(t), note: t.split('\n').filter(Boolean).slice(0, 12).join(' | ') };
});
await step('Therapies from the library: tick three, add them', '/admin/schedule', async () => {
  await go(rowBtn(/Add your therapies/));
  for (const n of ['Abhyanga', 'Shirodhara', 'Consultation']) await dlg().getByLabel(`Add ${n}`).check();
  await go(dlg().getByRole('button', { name: /^Add 3/ }));
  const n = (await api('GET', '/therapies')).length;
  return { ok: n === 3, note: `${n} therapies now` };
});
await step('Rooms: the form, then rooms made with the fittings the therapies need', '/admin/rooms', async () => {
  await go(plusBtn('Add a room'));
  const form = await text(dlg());
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  for (const [name, am] of [['Room 1', [0, 1, 2]], ['Room 2', [0, 3, 4]], ['Consulting room', [5, 6]]]) await api('POST', '/rooms', { name, amenities: am.map((i) => AM[i]) });
  await p.reload(); await p.waitForTimeout(1200);
  const rooms = (await api('GET', '/rooms')).length;
  return { ok: rooms === 3, note: `${rooms} rooms; form: ${form.split('\n').filter(Boolean).slice(0, 8).join(' | ')}` };
});
await step('Therapists: Asha added on the form, a doctor and two more by API', '/admin/team', async () => {
  await go(plusBtn('Add a therapist or doctor'));
  await dlg().getByLabel('Name').fill('Asha');
  const form = await text(dlg());
  await go(dlg().getByRole('button', { name: /^(Save|Add)/ }).first());
  const th = await api('GET', '/therapies');
  const ids = th.filter((t) => t.name !== 'Consultation').map((t) => t.id);
  for (const [name, gender, role] of [['Bina', 'female', 'therapist'], ['Chandan', 'male', 'therapist'], ['Dev', 'male', 'therapist'], ['Dr Rao', 'male', 'doctor']]) await api('POST', '/staff', { name, gender, role, specializations: role === 'doctor' ? [th.find((t) => t.name === 'Consultation').id] : ids });
  await p.reload(); await p.waitForTimeout(1200);
  const staff = await api('GET', '/staff');
  return { ok: staff.length === 5, note: `${staff.length} on the team; form: ${form.split('\n').filter(Boolean).slice(0, 8).join(' | ')}` };
});
await step('Patients: + New patient, name and gender, lands on the card; five more by API with stays', '/admin/patients', async () => {
  await go(plusBtn('New patient'));
  await dlg().getByLabel('Name', { exact: true }).fill('Tara Das');
  await go(dlg().getByRole('button', { name: 'Female' }));
  const form = await text(dlg());
  await go(dlg().getByRole('button', { name: 'Add Tara Das' }));
  const card = await text(dlg());
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  for (const [name, gender] of [['Rekha Nair', 'female'], ['Mohan Iyer', 'male'], ['Leela Menon', 'female'], ['Sunil Rao', 'male'], ['Gita Shah', 'female']]) await api('POST', '/patients', { name, gender, stay: { start_date: plus(-2), end_date: plus(12) } });
  const all = await api('GET', '/patients');
  const tara = all.find((x) => x.name === 'Tara Das');
  const appts = await api('GET', `/appointments?patient_id=${tara.id}`);
  return { ok: all.length === 6 && /Diet/.test(card) && appts.length >= 1, note: `${all.length} patients; Tara has ${appts.length} booking (the consultation); form: ${form.split('\n').filter(Boolean).slice(0, 7).join(' | ')}` };
});
await step('Book a treatment from the day: + → who → Abhyanga → Book', '/admin/schedule', async () => {
  await tomorrow();
  await go(plusBtn('Book a treatment'));
  await dlg().getByLabel('Search patients').fill('Rekha');
  await go(dlg().getByRole('button', { name: /^Rekha Nair/ }).first());
  // Nothing is chosen for the admin (#330): the therapy is a tap.
  await go(dlg().getByRole('button', { name: /^Abhyanga/ }).first());
  const bookBtn = dlg().getByRole('button', { name: /^Book / }).first();
  const label = await bookBtn.innerText();
  await go(bookBtn);
  const toast = await p.locator('[data-sonner-toast]').first().innerText().catch(() => '');
  const appts = await api('GET', `/appointments?date=${plus(1)}`);
  return { ok: /Booked/.test(toast) && appts.length >= 1, note: `button "${label}"; toast "${toast.replace(/\n/g, ' ')}"; ${appts.length} on tomorrow's sheet` };
});
await step('A course: Abhyanga, 3 sessions one a day', '/admin/schedule', async () => {
  await p.waitForTimeout(9000); // the last toast covers the bar for 8 s
  await tomorrow();
  await go(plusBtn('Book a treatment'));
  await dlg().getByLabel('Search patients').fill('Mohan');
  await go(dlg().getByRole('button', { name: /^Mohan Iyer/ }).first());
  await go(dlg().getByRole('button', { name: /^Abhyanga/ }).first());
  await dlg().getByLabel('Sessions', { exact: true }).selectOption({ label: '3 sessions, one a day' });
  const bookBtn = dlg().getByRole('button', { name: /^Book \w+, 3 days from/ });
  const label = await bookBtn.innerText();
  await go(bookBtn);
  const toast = await p.locator('[data-sonner-toast]').first().innerText().catch(() => '');
  const mohan = (await api('GET', '/patients')).find((x) => x.name === 'Mohan Iyer');
  const appts = await api('GET', `/appointments?patient_id=${mohan.id}`);
  return { ok: appts.length === 3, note: `button "${label}"; toast "${toast.replace(/\n/g, ' ')}"; days ${appts.map((a) => a.scheduled_date.slice(0, 10) + ' ' + a.scheduled_date.slice(11, 16)).join(', ')}` };
});
await step("Print tomorrow's sheets: Menu → Print downloads a PDF with the names on it", '/admin/schedule', async () => {
  await tomorrow();
  await menu();
  const dl = p.waitForEvent('download');
  await go(dlg().getByRole('button', { name: /^Print the day's sheets/ }));
  const file = `${OUT}/day-sheet.pdf`;
  await (await dl).saveAs(file);
  const { execSync } = await import('node:child_process');
  const txt = execSync(`pdftotext -layout ${file} -`).toString();
  return { ok: /Rekha Nair/.test(txt) && /Mohan Iyer/.test(txt) && /Abhyanga/.test(txt), note: `PDF ${txt.split('\n').filter(Boolean).slice(0, 4).join(' | ').slice(0, 200)}` };
});
await step('Leave: Menu → Leave → + → Asha, tomorrow, Save plan later; the pill then names who is stranded', '/admin/schedule', async () => {
  await p.waitForTimeout(9000);
  const who = (await api('GET', `/appointments?date=${plus(1)}`))[0];
  const staff = await api('GET', '/staff');
  const name = staff.find((x) => x.id === who.staff_id)?.name;
  await menu(); await go(dlg().getByRole('button', { name: /^Leave/ }));
  await go(plusBtn('Add leave'));
  await go(dlg().getByRole('button', { name: /^Who or what/ }));
  await go(p.getByRole('dialog').last().getByRole('button', { name, exact: true }));
  await dlg().locator('input[type=date]').nth(0).fill(plus(1));
  await dlg().locator('input[type=date]').nth(1).fill(plus(1));
  await go(dlg().getByRole('button', { name: 'Save, plan later', exact: true }));
  await p.waitForTimeout(1500);
  const toast = await p.locator('[data-sonner-toast]').first().innerText().catch(() => '');
  await p.waitForTimeout(9000);
  await go(rowBtn(/^Back to Day$/));
  await tomorrow();
  await menu();
  const t = await text(dlg());
  return { ok: /Leave saved/.test(toast) && /need you/.test(t), note: `${name} off; toast "${toast.replace(/\n/g, ' ')}"; menu: ${t.split('\n').filter(Boolean).slice(0, 4).join(' | ')}` };
});
await step('Fix from the pill: the day clears, then Undo puts it back', '/admin/schedule', async () => {
  await tomorrow(); await menu();
  await go(dlg().getByRole('button', { name: /need you/ }));
  const sheet = await text(dlg());
  const before = JSON.stringify((await api('GET', `/appointments?date=${plus(1)}`)).map((a) => [a.id, a.staff_id, a.start_time]).sort());
  await go(dlg().locator('[data-main]').first());
  await p.waitForTimeout(1500);
  const done = await text(dlg());
  const mid = JSON.stringify((await api('GET', `/appointments?date=${plus(1)}`)).map((a) => [a.id, a.staff_id, a.start_time]).sort());
  await go(dlg().getByRole('button', { name: 'Undo', exact: true }));
  await p.waitForTimeout(1500);
  const after = JSON.stringify((await api('GET', `/appointments?date=${plus(1)}`)).map((a) => [a.id, a.staff_id, a.start_time]).sort());
  return { ok: mid !== before && after === before && /✓/.test(done), note: `sheet: ${sheet.split('\n').filter(Boolean).slice(0, 6).join(' | ')}; moved ${mid !== before}; undone ${after === before}` };
});
const openCard = async (who) => { await tomorrow(); await go(p.getByText(who, { exact: true }).first()); };
const somethingWrong = (label) => go(dlg().getByRole('button', { name: /Something wrong/ })).then(() => go(dlg().getByRole('button', { name: label })));
await step("No-show: Rekha didn't come, from the treatment card; Undo follows", '/admin/schedule', async () => {
  await openCard('Rekha Nair');
  await somethingWrong(/didn't come/);
  const toast = await p.locator('[data-sonner-toast]').first().innerText().catch(() => '');
  const rekha = (await api('GET', '/patients')).find((x) => x.name === 'Rekha Nair');
  const a = await api('GET', `/appointments?patient_id=${rekha.id}`);
  return { ok: a.some((x) => x.status === 'no_show' || x.status === 'no-show'), note: `statuses ${a.map((x) => x.status).join(', ')}; toast "${toast.replace(/\n/g, ' ')}"` };
});
await step('Cancellation: Mohan wants to cancel one day of the course', '/admin/schedule', async () => {
  await p.waitForTimeout(9000);
  await openCard('Mohan Iyer');
  await somethingWrong(/wants to cancel/);
  const toast = await p.locator('[data-sonner-toast]').first().innerText().catch(() => '');
  const mohan = (await api('GET', '/patients')).find((x) => x.name === 'Mohan Iyer');
  const a = await api('GET', `/appointments?patient_id=${mohan.id}`);
  return { ok: a.some((x) => x.status === 'cancelled'), note: `statuses ${a.map((x) => x.status).join(', ')}; toast "${toast.replace(/\n/g, ' ')}"` };
});
await step('Doctor consultation: Leela booked from + with Therapy set to Consultation', '/admin/schedule', async () => {
  await p.waitForTimeout(9000);
  await tomorrow();
  await go(plusBtn('Book a treatment'));
  await dlg().getByLabel('Search patients').fill('Leela');
  await go(dlg().getByRole('button', { name: /^Leela Menon/ }).first());
  await go(dlg().getByRole('button', { name: /^Consultation/ }).first()); await p.waitForTimeout(1500);
  const bookBtn = dlg().getByRole('button', { name: /^Book / }).first();
  const label = await bookBtn.innerText();
  await go(bookBtn);
  const toast = await p.locator('[data-sonner-toast]').first().innerText().catch(() => '');
  return { ok: /Booked/.test(toast), note: `button "${label}"; toast "${toast.replace(/\n/g, ' ')}"` };
});
await step("Private links: Asha's from Team, Dr Rao's and Rekha's by API; each opens its own day with no sign-in", '/admin/team', async () => {
  await go(p.getByText('Asha', { exact: true }).first());
  await go(dlg().getByRole('button', { name: /^Share their link/ }));
  const toast = await p.locator('[data-sonner-toast]').first().innerText().catch(() => '');
  const url1 = (toast.match(/https?:\/\/\S+\/l\/\S+/) || [])[0];
  const staff = await api('GET', '/staff'), pats = await api('GET', '/patients');
  const url2 = `${APP}/l/${(await api('POST', `/staff/${staff.find((x) => x.name === 'Dr Rao').id}/link`)).token}`;
  const url3 = `${APP}/l/${(await api('POST', `/patients/${pats.find((x) => x.name === 'Rekha Nair').id}/link`)).token}`;
  const fresh = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const q = await fresh.newPage();
  const reads = [];
  for (const [i, [name, url]] of [['Asha', url1 && url1.replace(/^https?:\/\/[^/]+/, APP)], ['Dr Rao', url2], ['Rekha', url3]].entries()) {
    await q.goto(url); await q.waitForTimeout(1500);
    await q.locator('button:has-text("›")').first().click(); await q.waitForTimeout(1200);
    await q.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${i + 1}.png` });
    reads.push(`${name}: ${(await q.locator('body').innerText()).split('\n').filter(Boolean).slice(0, 4).join(' / ')}`);
  }
  await fresh.close();
  return { ok: reads.length === 3 && reads.every((r) => /Walk Six/.test(r)), note: reads.join(' || ') };
});
await step('Discharge summary: Rekha\'s card shows 0 of 8 ready, and Print summary still prints', '/admin/patients', async () => {
  await go(p.getByText('Rekha Nair', { exact: false }).first());
  await go(dlg().getByRole('button', { name: /^Discharge summary/ }));
  const sheet = await text(dlg());
  const pop = p.context().waitForEvent('page', { timeout: 15000 }).catch(() => null);
  const dl = p.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await go(dlg().getByRole('button', { name: 'Print summary' }));
  const [page2, file] = await Promise.all([pop, dl]);
  let pdf = '';
  if (file) { await file.saveAs(`${OUT}/discharge.pdf`); const { execSync } = await import('node:child_process'); pdf = execSync(`pdftotext -layout ${OUT}/discharge.pdf -`).toString(); }
  return { ok: /0 of 8 ready/.test(sheet) && (/Rekha/.test(pdf) || !!page2), note: `${sheet.split('\n').filter(Boolean).slice(0, 3).join(' | ')}; printed: ${page2 ? 'opened in a tab' : file ? 'downloaded' : 'nothing'}; ${pdf.split('\n').filter(Boolean).slice(0, 3).join(' | ').slice(0, 160)}` };
});
await step('Move to another install: Settings → Backups → Download everything, then Load a centre on a fresh install; the same day sheet prints', '/admin/settings', async () => {
  await go(p.getByRole('button', { name: /^Backups/ }));
  const dl = p.waitForEvent('download');
  await go(dlg().getByRole('button', { name: 'Download everything' }));
  const file = `${OUT}/everything.json.gz`;
  await (await dl).saveAs(file);
  const B = 'http://localhost:8401';
  const login = async (base, email, password) => (await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).token;
  const sheet = async (base, tok) => { const r = await fetch(`${base}/api/daily-schedule-pdf?date=${plus(1)}`, { headers: { Authorization: `Bearer ${tok}` } }); writeFileSync(`${OUT}/tmp.pdf`, Buffer.from(await r.arrayBuffer())); const { execSync } = await import('node:child_process'); return execSync(`pdftotext -layout ${OUT}/tmp.pdf -`).toString().split('\n').filter((l) => !/printed/i.test(l)).join('\n'); };
  const a = await sheet(APP, token);
  const ctxB = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const tokB = await login(B, 'admin@example.com', 'demo1234');
  await ctxB.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, tokB);
  const q = await ctxB.newPage();
  await q.goto(`${B}/admin/settings`); await q.waitForTimeout(1500);
  await q.getByRole('button', { name: /^Backups/ }).click(); await q.waitForTimeout(800);
  await q.getByRole('dialog').last().locator('input[type=file]').setInputFiles(file); await q.waitForTimeout(800);
  await q.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-confirm.png` });
  await q.getByRole('dialog').last().getByRole('button', { name: 'Replace' }).click(); await q.waitForTimeout(4000);
  const tokB2 = await login(B, 'walk6@example.com', 'walksix1');
  const bb = tokB2 ? await sheet(B, tokB2) : '';
  await ctxB.close();
  return { ok: !!tokB2 && a.length > 200 && a === bb, note: `signed in on the new install with the old password: ${!!tokB2}; day sheets equal: ${a === bb} (${a.split('\n').length} lines)` };
});
const setTrial = async (days) => {
  const { execSync } = await import('node:child_process');
  execSync(`docker exec ruta-${process.env.UAT_SLUG || 'walk-six'}-db-1 psql -q -U ayurcalm ayurcalm -c "UPDATE \\"Settings\\" SET trial_started_at = now() - interval '${days} days'"`);
};
for (const days of [5, 26, 29, 31]) {
  await step(`Trial state ${days} days in: the banner and what + does`, '/admin/schedule', async () => {
    await setTrial(days);
    await p.reload(); await p.waitForTimeout(2000);
    const banner = (await text(p.locator('body'))).split('\n').filter(Boolean)[0];
    const write = await fetch(`${APP}/api/patients`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Trial Probe', gender: 'male' }) });
    if (write.ok) await api('DELETE', `/patients/${(await write.json()).id}`);
    await p.waitForTimeout(500);
    await p.getByRole('button', { name: 'Book a treatment', exact: true }).click();
    await p.waitForTimeout(1200);
    const after = await p.locator('[data-sonner-toast]').first().innerText().catch(() => '') || (await text(dlg()).catch(() => '')).split('\n')[0];
    const readOnly = days > 30;
    return { ok: write.ok === !readOnly, note: `banner "${banner}"; API write ${write.status}; tapping +: "${after.replace(/\n/g, ' ').slice(0, 110)}"` };
  });
}
await setTrial(0);
await b.close();

writeFileSync(`${OUT}/lines.json`, JSON.stringify(lines));
writeFileSync(`${OUT}/README.md`, `# UAT ${process.argv[2] || ''}\n\nBase ${APP}, 375x812. Written by scripts/uat.mjs.\n\n| # | Step | Result | Read off the page | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
