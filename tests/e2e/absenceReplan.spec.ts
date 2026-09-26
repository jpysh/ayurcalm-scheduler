import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * The path the admin walks when a therapist is not coming in: mark them off,
 * open Verify, accept its plan, see a clean day, then Undo and get the day back
 * exactly as it was. The screen and the server have disagreed about this path
 * twice, so it is walked in a browser, and what the day holds is read back from
 * the API rather than trusted from the screen.
 *
 * The day is built here, on a fixed day in 2030, not taken from the seed: the
 * seeded problem day moves with today. One resident may only be treated by one
 * therapist, so when that therapist is off, the replan that runs on saving the
 * absence cannot swap or re-time the treatment. It is left for Verify, whose
 * plan moves it to the next day.
 */
const ADMIN = { email: 'admin@example.com', password: 'demo1234' };
const DAY = '2030-03-13';
const NEXT = '2030-03-14';
const TAG = 'Walktest';
const THERAPIST = `${TAG} Asha`;
const RESIDENT = `${TAG} Rekha`;

const allWeek = Object.fromEntries(
  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]),
);

async function api(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: ADMIN });
  expect(login.ok()).toBeTruthy();
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const call = async (method: 'get' | 'post' | 'delete', path: string, data?: unknown) => {
    const res = await request[method](`/api${path}`, { headers, data });
    expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
    // Some deletes answer with no body.
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
  return call;
}

type Call = Awaited<ReturnType<typeof api>>;

/** Removes what an earlier run left, so a run that failed halfway cannot break the next. */
async function tidy(call: Call) {
  for (const p of await call('get', '/patients')) if (p.name.startsWith(TAG)) await call('delete', `/patients/${p.id}`);
  for (const s of await call('get', '/staff')) if (s.name.startsWith(TAG)) await call('delete', `/staff/${s.id}`);
  for (const r of await call('get', '/rooms')) if (r.name.startsWith(TAG)) await call('delete', `/rooms/${r.id}`);
  for (const t of await call('get', '/therapies')) if (t.name.startsWith(TAG)) await call('delete', `/therapies/${t.id}`);
}

/** Everything booked on the two days the plan touches, in a form that compares exactly. */
async function snapshot(call: Call) {
  const rows = [...await call('get', `/appointments?date=${DAY}`), ...await call('get', `/appointments?date=${NEXT}`)];
  return rows
    .map((a: Record<string, unknown>) => ({ id: a.id, staff_id: a.staff_id, room_id: a.room_id, start_time: a.start_time, scheduled_date: a.scheduled_date, status: a.status }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByLabel('Password').press('Enter');
  await page.waitForURL(/\/admin/);
}

const activePanel = (page: Page) => page.locator('[role=tabpanel][data-state=active]');

/** Screens are reached from the bottom bar's menu (#66). A tap while the last screen is still loading can be lost, so retry. */
async function openTab(page: Page, name: string) {
  await expect(async () => {
    if (await page.getByRole('dialog').count() === 0) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${name}\\b`) }).click({ timeout: 1000 });
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 15000 });
}

test('a therapist off: Verify names it, its plan clears the day, and Undo puts the day back', async ({ page, request }) => {
  test.setTimeout(120000);
  const call = await api(request);
  await tidy(call);

  const therapy = await call('post', '/therapies', { name: `${TAG} Abhyanga`, duration_minutes: 60 });
  await call('post', '/rooms', { name: `${TAG} Room`, weekly_schedule: allWeek });
  const therapist = await call('post', '/staff', { name: THERAPIST, gender: 'female', specializations: [therapy.id], weekly_schedule: allWeek });
  const resident = await call('post', '/patients', {
    name: RESIDENT, gender: 'female', available_from: '2030-03-01', available_to: '2030-03-31',
    preferred_staff_id: therapist.id, requires_preferred_staff: true,
  });
  const booked = await call('post', '/appointments', {
    patient_id: resident.id, therapy_id: therapy.id, total_sessions: 1,
    preferred_time_range: { start: '10:00', end: '11:00' }, start_date: DAY, end_date: DAY,
    preferred_staff_id: therapist.id, now: '2030-01-01T00:00:00.000Z',
  });
  expect(booked.appointments?.[0]?.scheduled_date).toContain(DAY);

  await signIn(page);

  // Mark her off, the way the admin does.
  await openTab(page, 'Leave');
  await page.getByRole('button', { name: 'Add Time Off' }).click();
  const form = page.getByRole('dialog');
  const pick = async (n: number, option: string) => {
    await form.getByRole('combobox').nth(n).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  await pick(0, 'Staff');
  await pick(1, THERAPIST);
  await pick(2, 'Yes');
  await form.locator('input[type=date]').nth(0).fill(DAY);
  await form.locator('input[type=date]').nth(1).fill(DAY);
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Time off saved')).toBeVisible({ timeout: 15000 });

  // The day button on the bottom bar opens the date box, and picking a day shows it.
  await page.getByRole('button', { name: /^Change day/ }).click();
  await page.getByRole('dialog').locator('input[type=date]').fill(DAY);
  await expect(page.getByRole('navigation', { name: 'Main' })).toContainText('13 Mar', { timeout: 15000 });
  // Verify names who is off and whose treatment that leaves stranded.
  await activePanel(page).getByRole('button', { name: 'Verify', exact: true }).click();
  const verify = page.getByRole('dialog');
  await expect(verify).toContainText(THERAPIST, { timeout: 20000 });
  await expect(verify).toContainText(RESIDENT);

  const before = await snapshot(call);
  await verify.getByRole('button', { name: /^Accept the plan — 1 change$/ }).click();
  await expect(verify).toContainText('1 change made.', { timeout: 20000 });
  await expect(verify).toContainText('Nothing to fix');
  const accepted = await snapshot(call);
  expect(accepted).not.toEqual(before);
  expect((await call('get', `/day-check?date=${DAY}`)).problems).toEqual([]);

  await verify.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(verify).toContainText('Put back as it was.', { timeout: 20000 });
  expect(await snapshot(call)).toEqual(before);

  await tidy(call);
});
