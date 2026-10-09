import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * The launch line: the daily jobs the pilot centre cannot run a week without,
 * each walked whole on a phone and blocking a merge. The other jobs on the line
 * (glance, print, fix the day, book, add a patient) are smoke tests elsewhere.
 */
test.use({ viewport: { width: 375, height: 812 } });
const ADMIN = { email: 'admin@example.com', password: 'demo1234' };

async function signIn(page: Page, request: APIRequestContext) {
  const { token } = await (await request.post('/api/auth/login', { data: ADMIN })).json();
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByLabel('Password').press('Enter');
  await page.getByRole('button', { name: /^Menu$/ }).waitFor();
  return { Authorization: `Bearer ${token}` };
}

// In house today, not a fixed 2030 day: Patients lists only who is in, and that list is the job's way in.
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

async function withPatient(request: APIRequestContext, headers: Record<string, string>, name: string, run: () => Promise<void>) {
  const stay = { start_date: ymd(new Date()), end_date: ymd(new Date(Date.now() + 13 * 86400000)) };
  const made = await request.post('/api/patients', { headers, data: { name, gender: 'female', stay } });
  expect(made.ok(), await made.text()).toBeTruthy();
  const { id } = await made.json();
  try { await run(); } finally { await request.delete(`/api/patients/${id}`, { headers }); }
}

async function openCard(page: Page, name: string) {
  await page.goto('/admin/patients');
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  const card = page.getByRole('dialog').last();
  await card.getByRole('button', { name: /^Diet/ }).waitFor();
  return card;
}

test('@smoke meals are set from a date on the patient card', async ({ page, request }) => {
  const headers = await signIn(page, request);
  await withPatient(request, headers, 'Launch Meals', async () => {
    const card = await openCard(page, 'Launch Meals');
    await card.getByRole('button', { name: /^Diet/ }).click();
    await card.locator('button[aria-pressed]').nth(2).click();
    await card.getByRole('button', { name: /^Start this plan/ }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /from/ })).toBeVisible({ timeout: 20000 });
  });
});

test('@smoke a discharge summary prints from the card, complete or not', async ({ page, request }) => {
  const headers = await signIn(page, request);
  await withPatient(request, headers, 'Launch Discharge', async () => {
    const card = await openCard(page, 'Launch Discharge');
    await card.getByRole('button', { name: /^Discharge summary/ }).click();
    const download = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Print summary' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  });
});

test("@smoke a therapist's leave is recorded from the menu", async ({ page, request }) => {
  const headers = await signIn(page, request);
  const made = page.waitForResponse((r) => /\/api\/timeoff$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Leave/ }).click();
  await page.getByRole('button', { name: 'Add leave', exact: true }).click();
  const sheet = page.getByRole('dialog').last();
  await sheet.getByRole('button', { name: /^Who\b/ }).click();
  await page.getByRole('dialog').last().getByRole('button').filter({ hasNotText: /Closed for a day|Show/ }).first().click();
  await sheet.locator('input[type=date]').first().fill('2030-03-06');
  await sheet.locator('input[type=date]').nth(1).fill('2030-03-06');
  await sheet.getByRole('button', { name: 'Save, plan later' }).click();
  const res = await made;
  expect(res.ok(), await res.text()).toBeTruthy();
  const { id } = await res.json();
  await request.delete(`/api/timeoff/${id}`, { headers });
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Leave saved/ })).toBeVisible({ timeout: 20000 });
});
