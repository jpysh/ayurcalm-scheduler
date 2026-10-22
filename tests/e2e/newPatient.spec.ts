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

test('@smoke a patient is added from four fields, gets a consultation, and stays on the list with the card one tap away', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: ADMIN })).json();
  const headers = { Authorization: `Bearer ${token}` };
  await signIn(page);
  await page.getByRole('button', { name: 'New patient', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: 'Type a name first' })).toBeDisabled();
  await sheet.getByLabel('Name', { exact: true }).fill('E2E Meera Nair');
  await sheet.getByRole('button', { name: 'Female' }).click();
  await expect(sheet.getByText('First consultation')).toBeVisible({ timeout: 15000 });
  await expect(sheet.getByRole('button', { name: 'Later' })).toBeVisible();
  await sheet.getByRole('button', { name: /More details/ }).click();
  await expect(sheet.getByLabel('Passport or ID (optional)')).toBeVisible();
  let id = '';
  try {
    await sheet.getByRole('button', { name: 'Add patient' }).click();
    // They stay on the list (#935): the sheet is gone, the toast names them and offers the card.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('[data-sonner-toast]').filter({ hasText: 'E2E Meera Nair added' }).getByRole('button', { name: 'Open card' }).click();
    const card = page.getByRole('dialog').last();
    await expect(card.getByRole('button', { name: /^Diet/ })).toContainText('Not decided yet', { timeout: 15000 });
    await expect(card.getByRole('button', { name: /^Package/ })).toBeVisible();
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
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Search patients/ }).click();
  await expect(page.getByPlaceholder('Search patients')).toBeFocused();
  await page.keyboard.type('sha');
  await expect(page.getByText(/^Patients matching/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Diet:/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Search everything for/ })).toBeVisible();
});

test('a save refused for too many changes says so, not a guess', async ({ page }) => {
  await page.route('**/api/patients', (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 429, contentType: 'application/json', headers: { 'Retry-After': '30' }, body: JSON.stringify({ error: 'Too Many Requests', retry_after: 30 }) })
    : route.continue());
  await signIn(page);
  await page.getByRole('button', { name: 'New patient', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Name', { exact: true }).fill('E2E Too Many');
  await sheet.getByRole('button', { name: 'Female' }).click();
  await sheet.getByRole('button', { name: 'Add patient' }).click();
  await expect(page.getByText('Too many changes at once, so this was not saved. Try again in 30 seconds.')).toBeVisible();
  // The form stays open for the retry.
  await expect(sheet.getByRole('button', { name: 'Add patient' })).toBeEnabled();
  await expect(page.getByText(/consultation time|Could not save/)).toHaveCount(0);
});

test('a double tap on Add on a slow network adds the patient once', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: ADMIN })).json();
  const headers = { Authorization: `Bearer ${token}` };
  let posts = 0;
  await page.route('**/api/patients', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++;
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });
  await signIn(page);
  await page.getByRole('button', { name: 'New patient', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Name', { exact: true }).fill('E2E Double Tap');
  await sheet.getByRole('button', { name: 'Female' }).click();
  try {
    await sheet.getByRole('button', { name: 'Add patient' }).dblclick();
    await expect(page.getByText('E2E Double Tap added')).toBeVisible({ timeout: 15000 });
    expect(posts).toBe(1);
  } finally {
    const all = (await (await request.get('/api/patients', { headers })).json()) as { id: string; name: string }[];
    for (const p of all.filter((x) => x.name === 'E2E Double Tap')) await request.delete(`/api/patients/${p.id}`, { headers });
  }
});

test('a long name stops at 80 letters and counts from 70', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'New patient', exact: true }).click();
  const name = page.getByRole('dialog').locator('input[maxlength="80"]');
  await name.pressSequentially('x'.repeat(85));
  await expect(name).toHaveValue('x'.repeat(80));
  await expect(page.getByText('80 of 80 letters')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Add patient' })).toBeVisible();
});

/** #936: the phone's Back closes an open sheet instead of stranding it over the screen. */
test('Back closes the New patient sheet', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'New patient', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/patients/);
});

/** #965: a sheet opened as another closes (Share their link waits for the link first) stays open, and Back still closes it. */
test('Share their link stays open until Back', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/team');
  await page.getByText('Neha Singh', { exact: true }).click();
  await page.getByText('Share their link').click();
  const sheet = page.getByRole('dialog').filter({ hasText: 'Copy link' });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/team/);
});
