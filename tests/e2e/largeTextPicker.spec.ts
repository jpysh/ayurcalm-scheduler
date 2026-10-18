import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// At 200% text a choice's line stays readable: the price goes under it, not beside (#903). Reads only.
test('Accommodation choices at large text keep their line whole', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; }); }, token);
  await page.goto('/admin/patients');
  await page.getByRole('button', { name: /Day \d+ of \d+/ }).first().click();
  await page.getByRole('button', { name: /^Accommodation/ }).click();
  const line = page.getByRole('dialog').getByText(/a day · \d+ free/).first();
  await expect(line).toBeVisible();
  expect((await line.boundingBox())!.width).toBeGreaterThan(250);
});
