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
  const call = async (method: 'get' | 'post' | 'put' | 'delete', path: string, data?: unknown) => {
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
  await call('put', '/attention/rules', {});
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


/** Screens are reached from the bottom bar's menu (#66). A tap while the last screen is still loading can be lost, so retry. */
async function openTab(page: Page, name: string) {
  await expect(async () => {
    if (await page.getByRole('dialog').count() === 0) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const target = page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${name}\\b`) });
    // The menu has no "Back to the day" while the day is on screen: closing it is the same thing.
    if (name === 'Back to the day' && await target.count() === 0 && await page.getByRole('dialog').getByText(/^Go to$/i).count() > 0) { await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 2000 }); return; }
    await target.click({ timeout: 1000 });
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 15000 });
}

/** A therapist with one treatment on DAY that only she may give, so her absence is a problem nothing else fixes. */
async function build(call: Call) {
  const therapy = await call('post', '/therapies', { name: `${TAG} Abhyanga`, duration_minutes: 60 });
  await call('post', '/rooms', { name: `${TAG} Room`, weekly_schedule: allWeek });
  const therapist = await call('post', '/staff', { name: THERAPIST, gender: 'female', specializations: [therapy.id], weekly_schedule: allWeek });
  const resident = await call('post', '/patients', {
    name: RESIDENT, gender: 'female', stay: { start_date: '2030-03-01', end_date: '2030-03-31' },
    preferred_staff_id: therapist.id, requires_preferred_staff: true,
  });
  const booked = await call('post', '/appointments', {
    patient_id: resident.id, therapy_id: therapy.id, total_sessions: 1,
    preferred_time_range: { start: '10:00', end: '11:00' }, start_date: DAY, end_date: DAY,
    preferred_staff_id: therapist.id, now: '2030-01-01T00:00:00.000Z',
  });
  expect(booked.appointments?.[0]?.scheduled_date).toContain(DAY);

  return { therapist, resident };
}

test('@smoke a therapist off: the pill names it, its fix clears the day, and Undo puts the day back', async ({ page, request }) => {
  test.setTimeout(120000);
  const call = await api(request);
  await tidy(call);

  const { therapist } = await build(call);

  await signIn(page);

  // Mark her off, the way the admin does.
  await openTab(page, 'Leave');
  await page.getByRole('button', { name: 'Add leave', exact: true }).click();
  const form = page.getByRole('dialog');
  // Nobody chosen yet: neither save can be tapped, and the sheet says why (#337).
  await expect(form.getByRole('button', { name: 'Save, plan later', exact: true })).toBeDisabled();
  await expect(form.getByText('Choose who is away to save.')).toBeVisible();
  // Who first, from one list (#265).
  await form.getByRole('button', { name: /^Who\b/ }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: THERAPIST, exact: true }).click();
  await expect(form.getByRole('switch', { name: 'Full day' })).toBeChecked();
  await form.locator('input[type=date]').nth(0).fill(DAY);
  await form.locator('input[type=date]').nth(1).fill(DAY);
  // Plan later (#285 story 9): the leave waits on the pill, which is what this walk fixes.
  await form.getByRole('button', { name: 'Save, plan later', exact: true }).click();
  await expect(page.getByText(/Leave saved/)).toBeVisible({ timeout: 15000 });

  // The date is on the bar only on the day (#285), so go back to it first.
  await openTab(page, 'Back to the day');
  // The day button on the bottom bar opens the date box, and picking a day shows it.
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Change day/ }).click();
  await page.getByRole('dialog').locator('input[type=date]').fill(DAY);
  await expect(page.getByRole('button', { name: /13 Mar/, pressed: true })).toBeVisible({ timeout: 15000 });
  // The pill opens its sheet, which names who is off and whose treatment that leaves stranded.
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /need you/ }).click();
  const verify = page.getByRole('dialog');
  await expect(verify).toContainText(THERAPIST, { timeout: 20000 });
  await expect(verify).toContainText(RESIDENT);

  const before = await snapshot(call);
  await verify.locator('[data-main]').first().click();
  await expect(verify).toContainText('✓', { timeout: 20000 });
  await expect(verify).not.toContainText('For your action');
  const accepted = await snapshot(call);
  expect(accepted).not.toEqual(before);
  // She is off the whole day, so it goes to the next day. It used to land at 18:00
  // the same day: whole-day leave was saved as 09:00–18:00 (#219).
  expect(accepted[0].scheduled_date).toContain(NEXT);
  // Left: only the note that the resident has nothing booked today, which is true.
  const left = (await call('get', `/day-check?date=${DAY}`)).problems;
  expect(left.filter((p: { kind: string }) => p.kind !== 'IDLE_RESIDENT')).toEqual([]);

  await verify.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(verify).toContainText('Put back as it was.', { timeout: 20000 });
  expect(await snapshot(call)).toEqual(before);

  await tidy(call);
});

test('time off saved elsewhere shows in the pill when the app is back in view (#188)', async ({ page, request }) => {
  test.setTimeout(120000);
  const call = await api(request);
  await tidy(call);
  const { therapist } = await build(call);
  // Today's patient items count on any screen day and change with the clock; only the day's own are wanted here.
  await call('put', '/attention/rules', { leaves_today: { on: false }, arrival_open: { on: false }, no_diet: { on: false }, form_c: { on: false }, vitals: { on: false } });

  await signIn(page);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Change day/ }).click();
  await page.getByRole('dialog').locator('input[type=date]').fill(DAY);
  await expect(page.getByRole('button', { name: /13 Mar/, pressed: true })).toBeVisible({ timeout: 15000 });
  // Red only: a seeded therapist's weekly day off is a grey badge on any Wednesday.
  const needs = page.locator('nav[data-kit=bar] span[aria-hidden].bg-destructive');
  await expect(needs).toHaveCount(0);

  // Another phone marks her off; this one only hears of it when it is looked at again.
  await call('post', '/timeoff', { entity_type: 'staff', entity_id: therapist.id, start_date: DAY, end_date: DAY });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(needs).toBeVisible({ timeout: 15000 });

  // The sheet is about the day on screen, not today (#193).
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /need you/ }).click();
  await expect(page.getByRole('dialog').getByRole('heading').first()).toHaveText(/^Wed,? 13 Mar$/); // Linux's Chromium puts a comma after the weekday.

  await tidy(call);
});

test('the card counts the stay that holds the treatment, not the newest one (#190)', async ({ page, request }) => {
  test.setTimeout(120000);
  const call = await api(request);
  await tidy(call);
  await build(call);
  const resident = (await call('get', '/patients')).find((p: { name: string }) => p.name === RESIDENT);
  // A second stay booked for later: the newest, but not the one 13 March is in.
  await call('post', `/patients/${resident.id}/stays`, { start_date: '2030-05-01', end_date: '2030-05-10' });

  await signIn(page);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Change day/ }).click();
  await page.getByRole('dialog').locator('input[type=date]').fill(DAY);
  await expect(page.getByRole('button', { name: /13 Mar/, pressed: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: new RegExp(RESIDENT) }).first().click();
  await expect(page.getByRole('dialog')).toContainText('stay day 13 of 31');

  await tidy(call);
});

test("a no-show's card stays open, and moving it puts it back on the day (#193)", async ({ page, request }) => {
  test.setTimeout(120000);
  const call = await api(request);
  await tidy(call);
  try {
    const { resident } = await build(call);
    const mine = (await call('get', `/appointments?date=${DAY}`)).find((a: { patient_id: string }) => a.patient_id === resident.id);
    await call('put', `/appointments/${mine.id}`, { status: 'no_show' });

    await signIn(page);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Change day/ }).click();
    await page.getByRole('dialog').locator('input[type=date]').fill(DAY);
    await page.getByRole('button', { name: /^\d\d:\d\d/ }).filter({ hasText: "didn't come" }).first().click();
    const card = page.getByRole('dialog');
    await card.getByRole('button', { name: /^When/ }).click();
    // The list starts with the time as it stands, ticked, and ends with a way to any other day (#201).
    const now = card.getByRole('button', { name: /^10:00/ }).and(card.locator('[aria-pressed=true]'));
    await expect(now).toBeVisible();
    await expect(card.getByLabel('Another day', { exact: true })).toBeAttached();
    await card.getByRole('button', { name: /^\d\d:\d\d/ }).and(card.locator('[aria-pressed=false]')).first().click();
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 20000 });
    const after = (await call('get', `/appointments?date=${DAY}`)).find((a: { id: string }) => a.id === mine.id);
    expect(after?.status).toBe('pending');
  } finally {
    await tidy(call);
  }
});
