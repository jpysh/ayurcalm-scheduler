import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// Undo after the other phone of a shared login changed the treatment asks first (#900).
// Every write is answered here, so the seeded day is never changed.
test('Undo over another phone\'s change says so and offers Undo anyway', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const sent: Record<string, unknown>[] = [];
  await page.route('**/api/appointments/*', (r) => {
    if (r.request().method() !== 'PUT') return r.continue();
    const body = r.request().postDataJSON(); sent.push(body);
    if (sent.length === 2) return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ reason: 'CHANGED_SINCE', message: 'It was changed since, on another phone or link.' }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updated_at: '2030-01-01T10:00:00.000Z' }) });
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
  await page.locator('[data-sonner-toast]').filter({ hasText: "didn't come" }).getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('It was changed since, on another phone or link.')).toBeVisible();
  expect(sent[1].if_unchanged_since).toBe('2030-01-01T10:00:00.000Z');
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo anyway' }).click();
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2].if_unchanged_since).toBeUndefined();
});
