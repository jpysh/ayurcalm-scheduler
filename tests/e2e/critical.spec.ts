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
  const fromTeam: Record<string, string> = { Therapists: 'Therapists', Rooms: 'Rooms', Therapies: 'Therapies', Events: 'Classes and events' };
  if (fromTeam[name]) {
    await openTab(page, 'Team and rooms');
    await activePanel(page).getByRole('button', { name: fromTeam[name], exact: true }).click();
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
    ['Team and rooms', 'Working today'],
    ['Therapists', 'Staff Management'],
    ['Rooms', 'Room Management'],
    ['Therapies', 'Therapy Management'],
    ['Diet plans', 'Active Assignments'],
    ['Leave', 'Add leave'],
    ['Events', 'Events'],
    ['Residents', 'in house'],
    ['Settings', 'Centre details'],
    ['Back to the day', 'treatments'],
  ]) {
    await openTab(page, tab);
    await expect(activePanel(page)).toContainText(text, { timeout: 15000 });
  }
  // A page has one header line, as the design's (#193): its name, and no "‹ The day" line above it.
  for (const [tab, title] of [['Residents', 'Residents'], ['Team and rooms', 'Team and rooms'], ['Leave', 'Leave'], ['Diet plans', 'Diet'], ['Settings', 'Settings']]) {
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
  await openTab(page, 'Residents');
  const resident = activePanel(page).getByRole('button', { name: / · day \d+ of \d+$/ });
  await expect(resident.nth(5)).toBeVisible();
  await resident.first().click();
  await expect(page.getByRole('dialog')).toContainText('Meals today', { timeout: 15000 });
});

test('day sheet PDF prints for today', async ({ page, request }) => {
  await signIn(page);
  await passSetupIfShown(page);
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  const today = new Date().toISOString().slice(0, 10);
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
  await openTab(page, 'Rooms');
  // A centre edits its own data on day one, and an edit that looks saved but is
  // not is the failure nobody notices until the schedule is already wrong.
  //
  // Rows are found by position, not by their text: editing puts the name into
  // an input, so a locator matching on the name stops matching the moment the
  // row is opened for editing.
  const rowAt = (n: number) => activePanel(page).getByRole('row').nth(n);
  const indexOfRow = async (text: string) => {
    const rows = activePanel(page).getByRole('row');
    for (let n = 0; n < await rows.count(); n++) {
      if ((await rows.nth(n).innerText()).includes(text)) return n;
    }
    throw new Error(`no room row contains "${text}"`);
  };
  const rename = async (n: number, to: string) => {
    await rowAt(n).getByRole('button', { name: 'Edit', exact: true }).click();
    await rowAt(n).getByRole('textbox').first().fill(to);
    await rowAt(n).getByRole('button', { name: 'Save', exact: true }).click();
  };

  const original = (await rowAt(1).innerText()).split('\n')[0].trim();
  const edited = `${original} Renamed`;
  await rename(1, edited);
  await expect(activePanel(page)).toContainText(edited, { timeout: 15000 });

  await page.reload();
  await passSetupIfShown(page);
  await openTab(page, 'Rooms');
  await expect(activePanel(page)).toContainText(edited, { timeout: 15000 });

  // Put the name back, so the day sheet and the next run see the centre as it was.
  await rename(await indexOfRow(edited), original);
  await expect(activePanel(page)).not.toContainText(edited, { timeout: 15000 });
});

test('the booking dialog offers the slots the API found, and books one', async ({ page, request }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Back to the day');
  await page.getByRole('button', { name: 'Book a treatment' }).click();
  // + suggests one booking (#136); the full form, for a course, is "Someone else…".
  await page.getByRole('dialog').getByRole('button', { name: 'Someone else…' }).click();

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
    const pill = page.getByRole('button', { name: /1 to fix/ });
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
  await expect(page.getByText('Residents', { exact: true })).toBeVisible({ timeout: 15000 });
  // A resident chip is a full name; therapist chips are first names.
  await page.getByRole('button', { name: /^\S+ \S+/ }).first().click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const result = page.getByRole('button', { name: /^\d\d:\d\d/ }).first();
  await expect(result).toBeVisible({ timeout: 15000 });
  await result.click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Show this day' })).toBeVisible();
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
  const line = activePanel(page).locator('tr').filter({ hasText: 'Plumbing repair' });
  await expect(line).toContainText(/\d{1,2} \w{3,4}, 14:00–20:00/, { timeout: 15000 });
  await expect(line).not.toContainText('05:30');
});
