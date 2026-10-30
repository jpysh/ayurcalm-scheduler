import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// Undo on "Not in" said nothing when its delete was refused, and the therapist stayed out (#878).
// Both calls are answered here, so the seeded day is never changed.
test('a refused Undo on Not in says so', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  await page.route('**/api/timeoff', (r) => r.request().method() === 'POST'
    ? r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'e2e-undo', replan: [] }) })
    : r.continue());
  await page.route('**/api/timeoff/e2e-undo', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Undo failed' }) }));
  await page.goto('/admin/schedule');
  await page.getByRole('button', { name: /^Show the day by/ }).click();
  await page.getByText(/^Therapist$/).first().click();
  await page.getByRole('button', { name: / on leave$/ }).first().click();
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Undo failed')).toBeVisible();
});

// Undo after saving leave sent its deletes unread, so a refusal looked undone (#882).
test('a refused Undo on saved leave says so', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  await page.route('**/api/timeoff/*', (r) => r.request().method() === 'DELETE'
    ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Undo failed' }) })
    : r.continue());
  const made = page.waitForResponse((r) => /\/api\/timeoff$/.test(r.url()) && r.request().method() === 'POST');
  await page.goto('/admin/schedule');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Availability/ }).click();
  await page.getByRole('button', { name: 'Mark not available', exact: true }).click();
  const picker = page.getByRole('dialog').last();
  await picker.getByRole('checkbox').first().check();
  await picker.getByRole('button', { name: /^Next/ }).click();
  const sheet = page.getByRole('dialog').last();
  await sheet.getByRole('button', { name: 'Some days', exact: true }).click();
  await sheet.locator('input[type=date]').first().fill('2030-03-07');
  await sheet.locator('input[type=date]').nth(1).fill('2030-03-07');
  await sheet.getByRole('button', { name: 'Save, fix later' }).click();
  const { id } = await (await made).json();
  try {
    await page.locator('[data-sonner-toast]').filter({ hasText: /not available/ }).getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Undo failed')).toBeVisible();
  } finally {
    await request.delete(`/api/timeoff/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  }
});
