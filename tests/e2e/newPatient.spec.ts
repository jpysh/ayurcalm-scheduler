import { test, expect } from '@playwright/test';

/** #285 stories 4 and 6: a new patient in one step with the consultation pre-booked, landing on their card; search by what you know. */
test.use({ viewport: { width: 375, height: 812 } });
const ADMIN = { email: 'admin@example.com', password: 'demo1234' };

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByLabel('Password').press('Enter');
  await page.getByRole('button', { name: /^Menu$/ }).waitFor();
  await page.getByRole('button', { name: /^Menu$/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Patients/ }).click();
}

test('a patient is added from four fields, gets a consultation, and lands on their card', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: ADMIN })).json();
  const headers = { Authorization: `Bearer ${token}` };
  await signIn(page);
  await page.getByRole('button', { name: 'New patient' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: 'Add patient' })).toBeDisabled();
  await sheet.getByLabel('Name', { exact: true }).fill('E2E Meera Nair');
  await sheet.getByRole('button', { name: 'Female' }).click();
  await expect(sheet.getByText('First consultation')).toBeVisible({ timeout: 15000 });
  await expect(sheet.getByRole('button', { name: 'Later' })).toBeVisible();
  await sheet.getByRole('button', { name: /More details/ }).click();
  await expect(sheet.getByLabel('Passport or ID (optional)')).toBeVisible();
  let id = '';
  try {
    await sheet.getByRole('button', { name: 'Add E2E Meera Nair' }).click();
    // Their card, with everything else a row to fill in later.
    const card = page.getByRole('dialog').last();
    await expect(card.getByRole('button', { name: /^Diet/ })).toContainText('Not decided yet', { timeout: 15000 });
    await expect(card.getByRole('button', { name: /^Therapies/ })).toBeVisible();
    const found = ((await (await request.get('/api/patients', { headers })).json()) as { id: string; name: string }[]).find((p) => p.name === 'E2E Meera Nair');
    expect(found).toBeTruthy();
    id = found!.id;
    const booked = (await (await request.get(`/api/appointments?patient_id=${id}`, { headers })).json()) as unknown[];
    expect(booked.length, 'the consultation was pre-booked').toBe(1);
  } finally {
    if (id) await request.delete(`/api/patients/${id}`, { headers });
  }
});

test('Patients search shows the fact asked for and offers everything', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: /^Search patients/ }).click();
  await page.keyboard.type('sha');
  await expect(page.getByText(/^Patients matching/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Diet:/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Search everything for/ })).toBeVisible();
});
