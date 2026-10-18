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
  await page.getByRole('button', { name: / not in$/ }).first().click();
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Undo failed')).toBeVisible();
});
