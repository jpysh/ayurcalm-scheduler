import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// Tapping Today scrolls the list to the now line; that scroll folded the week away under the finger (#992).
test('Today leaves the week strip open', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  await page.goto('/admin/schedule');
  const week = page.getByLabel('Week');
  await expect(week).toBeVisible();
  await week.locator('button[aria-pressed="false"]').last().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.waitForTimeout(2000);
  await expect(week).toBeVisible();
});
