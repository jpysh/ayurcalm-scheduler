import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// Lost signal read as an empty centre and a silent save (#931). The cut is played by aborting every API call after the day has loaded.
test('no signal keeps the day on screen, says so, and a save says it was not saved', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  await page.goto('/admin/schedule');
  const rows = page.getByRole('button', { name: /^\d\d:\d\d/ });
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  await page.route(/\/api\/(?!health)/, (r) => r.abort('connectionfailed'));
  await page.route(/\/api\/health/, (r) => r.abort('connectionfailed'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText(/Offline, showing as of \d\d:\d\d/)).toBeVisible({ timeout: 15000 });
  await expect(rows).toHaveCount(before);
  await expect(page.getByText('Nothing booked')).toHaveCount(0);
  const status = await page.evaluate(async () => (await fetch('/api/patients', { method: 'POST', body: '{}' })).status);
  expect(status).toBe(503);
  await expect(page.getByText(/nothing was saved/i)).toBeVisible();
});
