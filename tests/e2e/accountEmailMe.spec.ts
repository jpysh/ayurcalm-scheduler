import { test, expect } from '@playwright/test';

/**
 * After changing your own sign-in email, People with access must still know
 * which row is you, or it offers to delete and switch you off (#927).
 * A throwaway second administrator does it, so the seeded admin is untouched.
 */
const ADMIN = { email: 'admin@example.com', password: 'demo1234' };
const ME = { email: 'walk927@example.com', password: 'walk927pass' };
const NEXT = 'walk927-new@example.com';

test('your own row stays yours after an email change', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: ADMIN })).json();
  const auth = { Authorization: `Bearer ${token}` };
  const made = await request.post('/api/users', { headers: auth, data: { ...ME, name: 'Walk 927', role: 'admin' } });
  expect(made.ok()).toBeTruthy();
  const { id } = await made.json();
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/login');
    await page.getByLabel(/email/i).first().fill(ME.email);
    await page.getByLabel(/password/i).first().fill(ME.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/schedule|setup/);
    await page.goto('/admin/settings');
    await page.getByText('Your account').click();
    await page.getByLabel('New email').fill(NEXT);
    await page.getByLabel('Current password').first().fill(ME.password);
    await page.getByRole('button', { name: 'Change my email' }).click();
    await expect(page.getByText(/You now sign in as/)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByText('People with access').click();
    await page.getByText(NEXT).first().click();
    await expect(page.getByText('This is you')).toBeVisible();
    await expect(page.getByText('Delete this person')).toHaveCount(0);
  } finally {
    await request.delete(`/api/users/${id}`, { headers: auth });
  }
});
