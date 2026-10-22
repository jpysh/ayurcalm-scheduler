import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// "pill" is a developer word; the admin sees a number on the Menu button (#1124).
test('Settings and What needs you never say pill', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  await page.goto('/admin/settings');
  const row = page.getByRole('button', { name: /^What needs you/ }).first();
  await expect(row).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/\bpill\b/i);
  await row.click();
  await expect(page.getByRole('dialog').last()).toContainText('Menu number');
  await expect(page.getByRole('dialog').last()).not.toContainText(/\bpill\b/i);
});
