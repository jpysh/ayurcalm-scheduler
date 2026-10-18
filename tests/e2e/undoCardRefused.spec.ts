import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// The card's Undo said nothing when its put-back was refused (#884).
// Both writes are answered here, so the seeded day is never changed.
test('a refused Undo on the treatment card says why', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  let puts = 0;
  await page.route('**/api/appointments/*', (r) => r.request().method() !== 'PUT' ? r.continue()
    : ++puts === 1 ? r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    : r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Undo refused here' }) }));
  await page.goto('/admin/schedule');
  // Tomorrow, so every treatment is still to come and its card offers "Something wrong".
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Change day/ }).click();
  await page.getByRole('dialog').locator('input[type=date]').fill(tomorrow);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /^\d\d:\d\d/ }).filter({ hasNotText: "didn't come" }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Something wrong/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /didn't come$/ }).click();
  await page.locator('[data-sonner-toast]').filter({ hasText: "didn't come" }).getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Undo refused here')).toBeVisible();
});
