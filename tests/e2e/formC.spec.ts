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

// A refused save said only "That could not be saved." though the server gave its reason (#874).
test('a refused Form C save shows the server reason', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  const headers = { Authorization: `Bearer ${token}` };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const made = await (await request.post('/api/patients', { headers, data: { name: 'E2E Formc Refused', gender: 'female', country: 'Germany', date_of_birth: '1984-03-12' } })).json();
  try {
    await request.post(`/api/patients/${made.id}/stays`, { headers, data: { start_date: today, end_date: today } });
    await page.route('**/form-c', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'The centre is closed that day' }) }));
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('demo1234');
    await page.getByLabel('Password').press('Enter');
    await page.waitForURL(/\/admin/);
    await page.goto('/admin/patients');
    await page.getByRole('button', { name: /^E2E Formc Refused/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Form C/ }).click();
    await page.getByRole('dialog').last().getByRole('button', { name: /filed/i }).first().click();
    await expect(page.getByText('The centre is closed that day')).toBeVisible();
  } finally {
    await request.delete(`/api/patients/${made.id}`, { headers });
  }
});
