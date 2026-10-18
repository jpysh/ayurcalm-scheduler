import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// A double tap on a closed day's "Open" sent two deletes and two Undo toasts (#879).
test('a double tap on Open reopens a closed day once', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  let deletes = 0;
  // Answered here after a pause, so the slow line is real and no closed day is removed.
  await page.route(/\/api\/timeoff\/[^/]+$/, async (r) => {
    if (r.request().method() !== 'DELETE') return r.continue();
    deletes++;
    await new Promise((x) => setTimeout(x, 1000));
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/admin/timeoff');
  await page.getByRole('button', { name: /^Centre closed days/ }).click();
  await page.getByRole('button', { name: /Open ›/ }).first().dblclick();
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(1);
  await page.waitForTimeout(1500);
  expect(deletes).toBe(1);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(1);
});
