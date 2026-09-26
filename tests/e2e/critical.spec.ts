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

/** Puts the schedule on a day: tapping the heading opens the calendar, which carries the date box. */
async function showDay(page: Page, day: string) {
  await openTab(page, 'Schedule');
  await activePanel(page).getByText('Schedule', { exact: true }).click();
  await activePanel(page).locator('input[type=date]').first().fill(day);
}

/** A click while the previous tab is still loading can be lost, so retry until selected. */
async function openTab(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1000 });
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
    ['Staff', 'Staff Management'],
    ['Rooms', 'Room Management'],
    ['Therapies', 'Therapy Management'],
    ['Diet', 'Diet Management'],
    ['Time off', 'Time Off'],
    ['Events', 'Events'],
    ['Patients', 'Patient Management'],
    ['Ailments', 'coming soon'],
    ['Settings', 'Centre details'],
    ['Schedule', 'Schedule'],
  ]) {
    await openTab(page, tab);
    await expect(activePanel(page)).toContainText(text, { timeout: 15000 });
  }
  // A seeded install has patients; an empty table means the API is not answering.
  await openTab(page, 'Patients');
  await expect(activePanel(page).getByRole('row').nth(5)).toBeVisible();
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
  // Page count, from the page tree. The sheet was seven pages of repeated diet
  // text; grouping by plan took it to three, and a layout fault that makes it
  // grow again (or emit a blank page) is invisible in every other assertion
  // here.
  const count = Number(/\/Count (\d+)/.exec(body.toString('latin1'))?.[1]);
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(4);
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

test('the booking dialog offers the slots the API found, and books one', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  await openTab(page, 'Schedule');
  await activePanel(page).getByRole('button', { name: 'Assign' }).click();

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
  await page.getByPlaceholder('Search patient').fill('Aarav Iyer');
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: /Select therapy/i }).click();
  await page.getByPlaceholder(/Search therapy/i).fill('Abhyanga');
  await page.getByRole('option').first().click();

  await page.getByRole('button', { name: 'Auto-Assign' }).click();
  await expect(page.getByText(/suggested slot/)).toBeVisible({ timeout: 20000 });

  await page.getByText(/^Option 1$/).click();
  await page.getByRole('button', { name: 'Confirm Selected Slot' }).click();
  await expect(page.getByText('Selected slot confirmed')).toBeVisible({ timeout: 20000 });
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
      name: `${TAG} Rekha`, gender: 'female', available_from: '2030-03-01', available_to: '2030-03-31',
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
    // The line names the worst problem and the resident in it, because a count
    // only tells the admin to open something. It comes from the same server
    // check that refuses a booking — the header has no rules of its own.
    await expect(page.getByText(new RegExp(`is not in on this day.*—.*${TAG} Rekha`))).toBeVisible({ timeout: 20000 });
    // Notes (a resident with nothing booked) stay in Verify: the header is only
    // for what must be fixed.
    await expect(page.getByText(/nothing booked/)).toHaveCount(0);
  } finally {
    await tidy();
  }
});
