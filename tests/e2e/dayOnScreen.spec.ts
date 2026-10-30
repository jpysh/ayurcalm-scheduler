import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// With another day on screen, Mark not available and Close another day started on today, and
// What needs you listed today's leave (#1072, #1071). Nothing is saved, so the seeded day is unchanged.
test('sheets opened on another day start on that day, and What needs you reads that day', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  await page.goto('/admin/schedule');
  const menu = () => page.getByRole('button', { name: 'Menu', exact: true }).click();
  await menu();
  await page.getByRole('dialog').getByRole('button', { name: /^Change day/ }).click();
  const asked = page.waitForRequest((r) => /\/api\/attention\?date=\d{4}-\d{2}-\d{2}$/.test(r.url()));
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  const day = new URL((await asked).url()).searchParams.get('date')!;
  await page.keyboard.press('Escape');

  await menu();
  await page.getByRole('dialog').getByRole('button', { name: /^Availability/ }).click();
  await page.getByRole('button', { name: 'Mark not available', exact: true }).click();
  const picker = page.getByRole('dialog').last();
  await picker.getByRole('checkbox').first().check();
  await picker.getByRole('button', { name: /^Next/ }).click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet.getByRole('button', { name: 'Some days', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.locator('input[type=date]').first()).toHaveValue(day);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /^Centre closed days/ }).click();
  await page.getByRole('button', { name: 'Close another day…' }).click();
  await expect(page.getByRole('dialog').last().locator('input[type=date]').first()).toHaveValue(day);
});
