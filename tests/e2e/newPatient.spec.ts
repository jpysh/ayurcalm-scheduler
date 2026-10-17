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

test('@smoke a patient is added from four fields, gets a consultation, and lands on their card', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: ADMIN })).json();
  const headers = { Authorization: `Bearer ${token}` };
  await signIn(page);
  await page.getByRole('button', { name: 'New patient', exact: true }).click();
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
    ? route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Too Many Requests' }) })
    : route.continue());
  await signIn(page);
  await page.getByRole('button', { name: 'New patient', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Name', { exact: true }).fill('E2E Too Many');
  await sheet.getByRole('button', { name: 'Female' }).click();
  await sheet.getByRole('button', { name: 'Add E2E Too Many' }).click();
  await expect(page.getByText('Too many changes at once, so nothing was saved. Wait a few minutes and try again.')).toBeVisible();
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
    await sheet.getByRole('button', { name: 'Add E2E Double Tap' }).dblclick();
    await expect(page.getByRole('dialog').last().getByRole('button', { name: /^Diet/ })).toBeVisible({ timeout: 15000 });
    expect(posts).toBe(1);
  } finally {
    const all = (await (await request.get('/api/patients', { headers })).json()) as { id: string; name: string }[];
    for (const p of all.filter((x) => x.name === 'E2E Double Tap')) await request.delete(`/api/patients/${p.id}`, { headers });
  }
});
