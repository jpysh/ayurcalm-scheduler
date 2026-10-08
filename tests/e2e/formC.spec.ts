import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// The FRRO form needs the whole date of birth; the sheet once showed "Mon 12 Mar" (#494).
test('Form C shows the date of birth with its year', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  const headers = { Authorization: `Bearer ${token}` };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const made = await (await request.post('/api/patients', { headers, data: { name: 'E2E Formc', gender: 'female', country: 'Germany', date_of_birth: '1984-03-12' } })).json();
  try {
    await request.post(`/api/patients/${made.id}/stays`, { headers, data: { start_date: today, end_date: today } });
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('demo1234');
    await page.getByLabel('Password').press('Enter');
    await page.waitForURL(/\/admin/);
    await page.goto('/admin/patients');
    await page.getByRole('button', { name: /^E2E Formc/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Form C/ }).click();
    await expect(page.getByRole('dialog').last()).toContainText('12 Mar 1984');
  } finally {
    await request.delete(`/api/patients/${made.id}`, { headers });
  }
});
