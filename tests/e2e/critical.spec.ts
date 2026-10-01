import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * The paths a centre cannot work without: signing in, reaching every tab, and
 * printing the day sheet. Needs a running install with the demo data.
 */
const ADMIN = { email: 'admin@example.com', password: 'demo1234' };

async function signIn(page: Page, password = ADMIN.password) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(password);
  // Enter, not a click: that is how people sign in.
  await page.getByLabel('Password').press('Enter');
}

/** A fresh install sends the admin through the setup wizard once. */
async function passSetupIfShown(page: Page) {
  await page.waitForURL(/\/(setup|admin)/);
  if (!page.url().includes('/setup')) return;
  await page.getByLabel('Centre name').fill('Test Centre');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Keep the example data for now' }).click();
  await page.waitForURL(/\/admin/);
}

// Tabs keep the last panel mounted while switching, so ask for the open one.
const activePanel = (page: Page) => page.locator('[role=tabpanel][data-state=active]');

/** Puts a day on screen from the bottom bar's day button. */
async function showDay(page: Page, day: string) {
  await page.getByRole('button', { name: /^Change day/ }).click();
  await page.getByRole('dialog').locator('input[type=date]').fill(day);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Screens are reached from the bottom bar's menu (#66). A tap while the last screen is still loading can be lost, so retry. */
async function openTab(page: Page, name: string) {
  // The editors for the lists open from Team and rooms, not the menu (#137).
  const fromTeam: Record<string, RegExp> = { Therapies: /^Therapies/, Events: /^Classes and events/ };
  if (fromTeam[name]) {
    await openTab(page, 'Team and rooms');
    await activePanel(page).getByRole('button', { name: fromTeam[name] }).click();
    return;
  }
  await expect(async () => {
    if (await page.getByRole('dialog').count() === 0) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${name}\\b`) }).click({ timeout: 1000 });
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 15000 });
}

test('wrong password stays on the login page', async ({ page }) => {
  await signIn(page, 'not-the-password');
  await expect(page.getByText(/invalid/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('signed-out visit to a tab goes to login', async ({ page }) => {
  await page.goto('/admin/patients');
  await expect(page).toHaveURL(/\/login/);
});

test('admin signs in with Enter and every tab shows its content', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  for (const [tab, text] of [
    ['Team and rooms', 'Therapists and doctors'],
    ['Therapies', 'Therapies'],
    ['Diet plans', 'Plans'],
    ['Leave', 'Upcoming'],
    ['Events', 'Events'],
    ['Patients', 'in house'],
    ['Settings', 'Centre details'],
    ['Back to the day', 'treatments'],
  ]) {
    await openTab(page, tab);
    await expect(activePanel(page)).toContainText(text, { timeout: 15000 });
  }
  // A page has one header line, as the design's (#193): its name, and no "‹ The day" line above it.
  for (const [tab, title] of [['Patients', 'Patients'], ['Team and rooms', 'Team and rooms'], ['Leave', 'Leave'], ['Diet plans', 'Diet plans'], ['Settings', 'Settings']]) {
    await openTab(page, tab);
    await expect(activePanel(page).getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByRole('button', { name: '‹ The day' })).toHaveCount(0);
  }
  // The Log opens from Settings with the demo's own changes in words (#130).
  await openTab(page, 'Settings');
  await activePanel(page).getByRole('button', { name: /^Log Everything/ }).click();
  await expect(activePanel(page)).toContainText(/Today|Yesterday/, { timeout: 15000 });
    // A seeded install has residents in house, and one opens on a card with
  // today's meals (#63); an empty list means the API is not answering.
  await openTab(page, 'Patients');
  const resident = activePanel(page).getByRole('button', { name: /Day \d+ of \d+ · leaves/ });
  await expect(resident.nth(5)).toBeVisible();
  await resident.first().click();
  await expect(page.getByRole('dialog')).toContainText('Meals today', { timeout: 15000 });
});

test('day sheet PDF prints for today', async ({ page, request }) => {
  await signIn(page);
  await passSetupIfShown(page);
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  // The centre's today, not UTC's: after 18:30 UTC that is still yesterday in India, an unseeded day (#208).
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const res = await request.get(`/api/daily-schedule-pdf?date=${today}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
  const body = await res.body();
  expect(body.subarray(0, 4).toString()).toBe('%PDF');
  // The seed books today, so the sheet has a table, not the "no activities" page.
  expect(body.length).toBeGreaterThan(5000);
  // How many pages is checked on a fixed day in server/src/tests/daySheet.test.ts (#159).
});

test('an edit to a room is still there after a reload', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Team and rooms');
  // A centre edits its own data on day one, and an edit that looks saved but is
  // not is the failure nobody notices until the schedule is already wrong.
  // Each room is a row; a tap opens its sheet (#273).
  const rows = activePanel(page).getByRole('button', { name: /Has |Nothing special/ });
  const rename = async (from: string, to: string) => {
    await activePanel(page).getByRole('button', { name: new RegExp(`^${from}`) }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: /^Details/ }).click();
    await page.getByRole('dialog').getByLabel('Name').fill(to);
    await page.getByRole('dialog').getByRole('button', { name: 'Save the room' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  };

  const original = (await rows.nth(1).innerText()).split('\n')[0].trim();
  const edited = `${original} Renamed`;
  await rename(original, edited);
  await expect(activePanel(page)).toContainText(edited, { timeout: 15000 });

  await page.reload();
  await passSetupIfShown(page);
  await openTab(page, 'Team and rooms');
  await expect(activePanel(page)).toContainText(edited, { timeout: 15000 });

  // Put the name back, so the day sheet and the next run see the centre as it was.
  await rename(edited, original);
  await expect(activePanel(page)).not.toContainText(edited, { timeout: 15000 });
});

test('the booking dialog offers the slots the API found, and books one', async ({ page, request }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Back to the day');
  await page.getByRole('button', { name: 'Book a treatment' }).click();
  // + opens one sheet to book one treatment (#285); the full form, for a course, is behind its last link.
  await page.getByRole('dialog').getByRole('button', { name: /^A course over several days/ }).click();

  // The centre's clock and the browser's clock are rarely the same one. The
  // dialog used to re-filter the server's slots against the browser's, so a
  // browser west of the centre saw "No slots available" for slots that exist.
  // From tomorrow: a run late in the day would otherwise be left with only the
  // slots the evening programme occupies, and find nothing for reasons that
  // have nothing to do with what this test is about.
  const start = new Date();
  start.setDate(start.getDate() + 1);
  const end = new Date();
  end.setDate(end.getDate() + 10);
  await page.getByLabel('Start Date').fill(start.toISOString().slice(0, 10));
  await page.getByLabel('End Date').fill(end.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Select patient' }).click();
  // Someone staying tomorrow: a resident is only booked while they are here (#142).
  const { token } = await (await request.post('/api/auth/login', { data: ADMIN })).json();
  const staying = await (await request.get(`/api/patients?resident_on=${start.toISOString().slice(0, 10)}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(staying.length, 'nobody in the demo is staying tomorrow').toBeGreaterThan(0);
  // The booking is removed afterwards, so repeated runs on one stack don't fill
  // the window and leave "No slots available" (#153).
  const headers = { Authorization: `Bearer ${token}` };
  const bookingsOf = async () => ((await (await request.get(`/api/appointments?patient_id=${staying[0].id}`, { headers })).json()) as { id: string }[]).map((a) => a.id);
  const before = new Set(await bookingsOf());
  try {
  await page.getByPlaceholder('Search patient').fill(staying[0].name);
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: /Select therapy/i }).click();
  await page.getByPlaceholder(/Search therapy/i).fill('Abhyanga');
  await page.getByRole('option').first().click();

  await page.getByRole('button', { name: 'Auto-Assign' }).click();
  await expect(page.getByText(/suggested slot/)).toBeVisible({ timeout: 20000 });

  await page.getByText(/^Option 1$/).click();
  await page.getByRole('button', { name: 'Confirm Selected Slot' }).click();
  await expect(page.getByText('Selected slot confirmed')).toBeVisible({ timeout: 20000 });
  } finally {
    for (const id of await bookingsOf()) if (!before.has(id)) await request.delete(`/api/appointments/${id}`, { headers });
  }
});

test("the day's problems are named on the first screen", async ({ page, request }) => {
  // Its own day in 2030: the seeded problem is today's, and once the centre's
  // clock passes its last treatment there is nothing left to fix (#149).
  const DAY = '2030-03-20';
  const TAG = 'Headline';
  const login = await (await request.post('/api/auth/login', { data: ADMIN })).json();
  const headers = { Authorization: `Bearer ${login.token}` };
  const call = async (method: 'get' | 'post' | 'delete', path: string, data?: unknown) => {
    const res = await (request as APIRequestContext)[method](`/api${path}`, { headers, data });
    expect(res.ok(), `${method} ${path}: ${res.status()}`).toBeTruthy();
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
  const tidy = async () => {
    for (const h of await call('get', '/timeoff')) if (String(h.description).startsWith(TAG)) await call('delete', `/timeoff/${h.id}`);
    for (const p of await call('get', '/patients')) if (p.name.startsWith(TAG)) await call('delete', `/patients/${p.id}`);
    for (const x of await call('get', '/staff')) if (x.name.startsWith(TAG)) await call('delete', `/staff/${x.id}`);
    for (const r of await call('get', '/rooms')) if (r.name.startsWith(TAG)) await call('delete', `/rooms/${r.id}`);
    for (const t of await call('get', '/therapies')) if (t.name.startsWith(TAG)) await call('delete', `/therapies/${t.id}`);
  };
  await tidy();
  try {
    const allWeek = Object.fromEntries(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]));
    const therapy = await call('post', '/therapies', { name: `${TAG} Abhyanga`, duration_minutes: 60 });
    await call('post', '/rooms', { name: `${TAG} Room`, weekly_schedule: allWeek });
    const therapist = await call('post', '/staff', { name: `${TAG} Asha`, gender: 'female', specializations: [therapy.id], weekly_schedule: allWeek });
    // Only she may treat this resident, so marking her off cannot quietly move it.
    const resident = await call('post', '/patients', {
      name: `${TAG} Rekha`, gender: 'female', stay: { start_date: '2030-03-01', end_date: '2030-03-31' },
      preferred_staff_id: therapist.id, requires_preferred_staff: true,
    });
    await call('post', '/appointments', {
      patient_id: resident.id, therapy_id: therapy.id, total_sessions: 1,
      preferred_time_range: { start: '10:00', end: '11:00' }, start_date: DAY, end_date: DAY,
      preferred_staff_id: therapist.id, now: '2030-01-01T00:00:00.000Z',
    });
    await call('post', '/timeoff', { entity_type: 'staff', entity_id: therapist.id, date: DAY, description: `${TAG} leave` });

    await signIn(page);
    await passSetupIfShown(page);
    await showDay(page, DAY);
    // The attention pill counts what must be fixed (#62, the phone design), and
    // one tap names it with the resident in it. The count comes from the same
    // server check that refuses a booking — the pill has no rules of its own.
    // A resident with nothing booked is a rest day, not a note.
    const pill = page.getByRole('button', { name: /1 need you/ });
    await expect(pill).toBeVisible({ timeout: 20000 });
    await expect(pill).not.toContainText('note');
    await pill.click();
    await expect(page.getByRole('dialog')).toContainText(`${TAG} Rekha`, { timeout: 20000 });
  } finally {
    await tidy();
  }
});

test('search finds a resident on other days and opens the card with Show this day', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  // Search covers every day, not the one on screen (#165): a resident from the
  // chips has treatments listed under day headings, and a result opens its card.
  await page.getByRole('button', { name: 'Search treatments' }).click();
  await expect(page.getByText('Patients', { exact: true })).toBeVisible({ timeout: 15000 });
  // A resident chip is a full name; therapist chips are first names.
  await page.getByRole('button', { name: /^\S+ \S+/ }).first().click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const result = page.getByRole('button', { name: /^\d\d:\d\d/ }).first();
  await expect(result).toBeVisible({ timeout: 15000 });
  // Five earlier searches are kept; opening a result puts this one first and drops the oldest (#193).
  await page.evaluate(() => localStorage.setItem('recentSearches', JSON.stringify(['q1', 'q2', 'q3', 'q4', 'q5'])));
  const searched = await page.getByPlaceholder('Name, therapy or room').inputValue();
  await result.click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Show this day' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recentSearches') || '[]'))).toEqual([searched, 'q1', 'q2', 'q3', 'q4']);
  // History is the design's timeline (#193): a line down the left, one dot per change.
  await page.getByRole('dialog').getByRole('button', { name: /^History/ }).click();
  const changes = page.getByRole('dialog').getByRole('list', { name: 'Changes' });
  await expect(changes).toHaveCSS('border-left-width', '2px');
});

test('a search match inside a room name keeps the name in one piece (#193)', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await page.getByRole('button', { name: 'Search treatments' }).click();
  await page.getByPlaceholder('Name, therapy or room').fill('ra');
  const mark = page.locator('mark').first();
  await expect(mark).toBeVisible({ timeout: 15000 });
  // In a flex box each highlighted piece became its own item, with a gap between: "Na ra da".
  const parents = await page.locator('mark').evaluateAll((ms) => ms.map((m) => getComputedStyle(m.parentElement!).display));
  expect(parents.filter((d) => d.includes('flex'))).toEqual([]);
});

test('a room out for some hours reads as the day and those hours in Leave (#189)', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Leave');
  // The seed takes a room out from 14:00 to 20:00 (a plumbing repair). It used to read
  // "27 Sept 2026, 05:30 am": UTC midnight on an Indian clock, with the hours lost.
  await activePanel(page).getByRole('button', { name: 'All', exact: true }).click();
  const line = activePanel(page).getByRole('button').filter({ hasText: 'Plumbing repair' });
  await expect(line).toContainText(/\d{1,2} \w{3,4}, 14:00–20:00/, { timeout: 15000 });
  await expect(line).not.toContainText('05:30');
  // Its edit sheet reads the same hours, not the phone's clock (#214).
  await line.click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet.getByLabel('Starts')).toHaveValue('14:00');
  await expect(sheet.getByLabel('Ends')).toHaveValue('20:00');
  await expect(sheet.getByRole('button', { name: 'Delete this leave' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('the day by therapist starts where the by-time view does (#193)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await passSetupIfShown(page);
  await showDay(page, '2030-03-13');
  const top = async (l: ReturnType<Page['getByText']>) => (await l.boundingBox())!.y;
  const byTime = await top(page.getByText(/ treatments/).first());
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Therapist', exact: true }).click();
  const back = page.getByRole('button', { name: 'Back to by time' });
  await expect(back).toBeVisible();
  // The design puts both headers 12px under the top of the screen; the page used to add 20px more.
  expect(byTime).toBeLessThan(20);
  expect(await top(back)).toBeLessThan(20);
});

test('on a phone, lists are plain rows and a tap opens the edit sheet (#178)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await passSetupIfShown(page);
  // Leave: a row opens a sheet with Delete in it.
  await openTab(page, 'Leave');
  const leave = activePanel(page).getByRole('button').filter({ hasText: /Personal/ }).first();
  await expect(leave).toBeVisible({ timeout: 15000 });
  await leave.click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Delete this leave' })).toBeVisible();
  await page.keyboard.press('Escape');
  // Diet plans: the centre's plans; one opens its editor with Retire in it.
  await openTab(page, 'Diet plans');
  await activePanel(page).getByRole('button', { name: /patients?$/ }).first().click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Retire this plan' })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('Escape');
  // Settings: a row opens its form in a sheet.
  await openTab(page, 'Settings');
  await activePanel(page).getByRole('button', { name: /^Opening hours/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Opens');
});

test('an admin who never finished setup is sent back to it (#60)', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: ADMIN })).json();
  const headers = { Authorization: `Bearer ${token}` };
  const s = await (await request.get('/api/settings', { headers })).json();
  const { centre_name, address, timezone, opening_time, closing_time, slot_minutes, working_days, logo } = s;
  const put = (setup_complete: boolean) => request.put('/api/settings', { headers, data: { centre_name, address, timezone, opening_time, closing_time, slot_minutes, working_days, logo, setup_complete } });
  expect((await put(false)).ok()).toBeTruthy();
  try {
    await signIn(page);
    await page.waitForURL(/\/setup/);
    // Straight to the day: the wizard used to be a suggestion, skipped by typing the address.
    await page.goto('/admin/schedule');
    await page.waitForURL(/\/setup/, { timeout: 15000 });
  } finally {
    await put(true);
  }
});

test("a resident's details show the stay under way, not the first one on file (#220)", async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Patients');
  // Someone arriving today: their stay starts today, and they have older and later stays in the seed.
  await activePanel(page).getByRole('button', { name: /day 1 of/i }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Details' }).click();
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const details = page.getByRole('dialog').last();
  await expect(details.getByRole('button', { name: new RegExp(`^${today} to`) })).toBeVisible();
  // The old per-resident meal list is gone; the card's plan is the one place meals are read.
  await expect(details.getByText('Diet Plans')).toHaveCount(0);
});

test("a resident's card shows the doctor's last and next consultation and a plan that can be edited (#219)", async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Patients');
  await activePanel(page).getByRole('button', { name: /day \d+ of/i }).first().click();
  const card = page.getByRole('dialog').last();
  await expect(card.getByText('Doctor', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(card.getByText('Next', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: /^Plan/ }).click();
  await expect(page.getByLabel('Plan (optional)')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Plan (optional)')).toHaveCount(0);
});

test('after a consultation, the note on the day opens the resident\'s meals in one tap (#219)', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  // Consultations are seeded from 09:00; before the first has ended there is no note yet.
  const pill = page.getByText(/\d+ notes?$/);
  await expect(page.getByText(/treatments ·/)).toBeVisible({ timeout: 15000 });
  test.skip(!(await pill.count()), 'no consultation has ended yet today');
  await pill.click();
  const diet = page.getByRole('dialog').getByRole('button', { name: 'Diet', exact: true });
  test.skip(!(await diet.count()), 'no consultation note today');
  await diet.first().click();
  // The meals sheet lived inside the Residents screen, so from the day it never showed.
  await expect(page.getByRole('dialog').getByText(/'s meals$/)).toBeVisible();
});

test('Therapies offers the standard library, and a seeded centre already has all of it (#219)', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Therapies');
  await activePanel(page).getByRole('button', { name: /Standard therapies/ }).click();
  await expect(page.getByRole('dialog').getByText('You already have every therapy in the library.')).toBeVisible({ timeout: 15000 });
});

test('leave for a day ahead is marked from Team, and a whole day carries no hours (#219)', async ({ page, request }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Team and rooms');
  await activePanel(page).getByRole('button', { name: /\b(Therapist|Doctor)\b/ }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Away another day' }).click();
  // A fixed day far ahead, so the demo's own days are never touched.
  await sheet.getByLabel('From', { exact: true }).fill('2030-03-04');
  await sheet.getByLabel('To', { exact: true }).fill('2030-03-05');
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().endsWith('/timeoff') && r.method() === 'POST'),
    sheet.getByRole('button', { name: /Mark leave/ }).click(),
  ]);
  const body = req.postDataJSON();
  // Whole-day leave used to be saved as 09:00–18:00, leaving 07:00 yoga and 18:30 treatments on.
  expect(body).toMatchObject({ start_date: '2030-03-04', end_date: '2030-03-05', start_time: null, end_time: null });
  const created = await (await req.response())!.json();
  const { token } = await (await request.post('/api/auth/login', { data: ADMIN })).json();
  expect((await request.delete(`/api/timeoff/${created.id}`, { headers: { Authorization: `Bearer ${token}` } })).ok()).toBe(true);
});

test('Leave offers India\'s public holidays, and a seeded centre is already closed on them (#219)', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Leave');
  await activePanel(page).getByRole('button', { name: 'Public holidays' }).click();
  await expect(page.getByRole('dialog').getByText('Every public holiday ahead is already a closed day.')).toBeVisible({ timeout: 15000 });
});

test('a resident leaving today has a departure section and a summary to take home (#219)', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Patients');
  const leaving = activePanel(page).locator('section').filter({ hasText: 'Leaving today' }).getByRole('button');
  await expect(activePanel(page).getByText(/treatments ·|Staying/).first()).toBeVisible({ timeout: 15000 });
  test.skip(!(await leaving.count()), 'nobody leaves today');
  await leaving.first().click();
  const card = page.getByRole('dialog').last();
  await expect(card.getByText('Departure', { exact: true })).toBeVisible({ timeout: 15000 });
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: /^↓ ?Discharge summary for/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/discharge summary\.pdf$/);
  // The form opens with what the app knows filled in, and saves.
  await card.getByRole('button', { name: /Write the discharge summary/ }).click();
  const form = page.getByRole('dialog').last();
  await expect(form.getByLabel('Condition at discharge')).not.toHaveValue('', { timeout: 15000 });
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
});

test('a resident arriving today has the arrival steps still to do (#219)', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Patients');
  const arriving = activePanel(page).locator('section').filter({ hasText: 'Arriving today' }).getByRole('button');
  await expect(activePanel(page).getByText(/Staying/).first()).toBeVisible({ timeout: 15000 });
  test.skip(!(await arriving.count()), 'nobody arrives today');
  await arriving.first().click();
  const card = page.getByRole('dialog').last();
  await expect(card.getByText('Arrival', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(card.getByRole('button', { name: /Vitals and concerns/ })).toBeVisible();
});

test('Team shows this week: booked hours against hours in, and each person\'s days (#219)', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Team and rooms');
  const line = activePanel(page).getByRole('button', { name: /^This week/ });
  await expect(line).toContainText(/\d+h booked of \d+h/, { timeout: 15000 });
  await line.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(/^Week of /)).toBeVisible();
  await expect(sheet.getByText(/^\d+h\/\d+h$/).first()).toBeVisible();
});

test('a therapist\'s private link opens their own day with no sign-in, and a tick is kept (#219)', async ({ browser, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: ADMIN })).json();
  const headers = { Authorization: `Bearer ${token}` };
  const staff = await (await request.get('/api/staff', { headers })).json();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  // Someone with a treatment today, so the page has a checklist to tick.
  let link = '';
  for (const s of staff.filter((x: { role: string }) => x.role !== 'doctor')) {
    const t = (await (await request.post(`/api/staff/${s.id}/link`, { headers })).json()).token;
    if ((await (await request.get(`/api/public/link/${t}?date=${today}`)).json()).items.length) { link = t; break; }
  }
  test.skip(!link, 'nobody has a treatment today');
  // A fresh context: no admin session, as on the therapist's phone.
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await page.goto(`/l/${link}`);
  await expect(page.getByText('Today', { exact: true })).toBeVisible({ timeout: 15000 });
  const box = page.getByRole('checkbox', { name: /^Room and table prepared/ }).first();
  const was = await box.isChecked();
  await box.setChecked(!was);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /^Room and table prepared/ }).first()).toBeChecked({ checked: !was, timeout: 15000 });
  await page.getByRole('checkbox', { name: /^Room and table prepared/ }).first().setChecked(was);
  await expect(page.getByText('Feedback', { exact: true })).toHaveCount(0);
  await page.goto('/l/not-a-real-link-token-000000');
  await expect(page.getByText('This link is no longer valid.', { exact: false })).toBeVisible({ timeout: 15000 });
});

test('an event is added, edited and deleted from one labelled sheet (#227)', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Events');
  const name = `E2E Walk ${Date.now()}`;
  await page.getByRole('button', { name: 'Add event' }).click();
  const sheet = page.getByRole('dialog').last();
  await sheet.getByLabel('Name', { exact: true }).fill(name);
  await sheet.getByLabel(/^From/).selectOption('06:00');
  await sheet.getByLabel(/^To/).selectOption('06:30');
  await sheet.getByRole('button', { name: 'Some days' }).click();
  await sheet.getByRole('button', { name: 'sunday' }).click();
  await sheet.getByRole('button', { name: 'Optional' }).click();
  await sheet.getByRole('button', { name: 'Add the event' }).click();
  const row = activePanel(page).getByRole('button', { name: new RegExp(name) });
  await expect(row).toContainText('Sun');
  await expect(row).toContainText('optional');
  // Nothing in the sheet is wider than the phone.
  await row.click();
  const edit = page.getByRole('dialog').last();
  await expect(edit.getByLabel('Name', { exact: true })).toHaveValue(name);
  expect(await edit.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await edit.getByLabel(/^To/).selectOption('06:45');
  await edit.getByRole('button', { name: 'Save the event' }).click();
  await expect(row).toContainText('06:00–06:45');
  await row.click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Delete' }).click();
  await expect(row).toHaveCount(0);
});

test('editing an event in the sheet keeps the dates it runs between (#227)', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: ADMIN })).json();
  const headers = { Authorization: `Bearer ${token}` };
  const name = `E2E Range ${Date.now()}`;
  const made = await request.post('/api/program-events', { headers, data: { activity_name: name, start_time: '05:00', end_time: '05:30', recurrence: 'weekly', weekdays: ['monday'], start_date: '2030-01-01', end_date: '2030-02-01' } });
  expect(made.ok()).toBeTruthy();
  const { id } = await made.json();
  try {
    await signIn(page);
    await passSetupIfShown(page);
    await openTab(page, 'Events');
    await activePanel(page).getByRole('button', { name: new RegExp(name) }).click();
    await page.getByRole('dialog').last().getByLabel(/^To/).selectOption('05:45');
    await page.getByRole('dialog').last().getByRole('button', { name: 'Save the event' }).click();
    await expect(activePanel(page).getByRole('button', { name: new RegExp(name) })).toContainText('05:00–05:45');
    const ev = ((await (await request.get('/api/program-events', { headers })).json()) as { id: string; start_date: string; end_date: string }[]).find((e) => e.id === id)!;
    expect(ev.start_date.slice(0, 10)).toBe('2030-01-01');
    expect(ev.end_date.slice(0, 10)).toBe('2030-02-01');
  } finally {
    await request.delete(`/api/program-events/${id}`, { headers });
  }
});
