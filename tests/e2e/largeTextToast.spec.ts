import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// At 200% text a toast with a long action keeps its words whole: the action goes under them (#902).
// Every write is answered here, so the seeded day is never changed.
test('Undo anyway at large text leaves the message readable', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; }); }, token);
  let n = 0;
  await page.route('**/api/appointments/*', (r) => {
    if (r.request().method() !== 'PUT') return r.continue();
    return ++n === 2 ? r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ reason: 'CHANGED_SINCE', message: 'It was changed since, on another phone or link.' }) })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updated_at: '2030-01-01T10:00:00.000Z' }) });
  });
  await page.goto('/admin/schedule');
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Change day/ }).click();
  await page.getByRole('dialog').locator('input[type=date]').fill(tomorrow);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /^\d\d:\d\d/ }).filter({ hasNotText: "didn't come" }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Something wrong/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /didn't come$/ }).click();
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo' }).click();
  const words = page.getByText('It was changed since, on another phone or link.');
  await expect(words).toBeVisible();
  expect((await words.boundingBox())!.width).toBeGreaterThan(250);
});
