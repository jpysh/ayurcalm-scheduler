import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// Opened at / (a bookmark, the home-screen icon), a screen change put the email in the address (#1123).
test('the address never carries the sign-in email', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Staff/ }).click();
  await expect(page).toHaveURL(/\/admin\/team$/);
});
