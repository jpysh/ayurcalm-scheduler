import { test, expect } from '@playwright/test';

/** #950: a forwarded link opens on its day with the week in reach, a dead one names the centre, and nothing is reported by a stray tap. */
test.use({ viewport: { width: 360, height: 640 } });

test('guest link: ?date= is honoured, the week is one tap, the details form takes a date field', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  const headers = { Authorization: `Bearer ${token}` };
  // Someone staying now: a past guest's link lapses, and the first patient on the list may be one.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const patient = (await (await request.get(`/api/patients?resident_on=${today}`, { headers })).json())[0];
  const { token: link } = await (await request.post(`/api/patients/${patient.id}/link`, { headers })).json();
  await page.goto(`/l/${link}?date=2030-03-04`);
  await expect(page.getByText('Monday 4 March')).toBeVisible();
  await page.getByRole('group', { name: 'Week' }).getByRole('button', { name: /Thu 7 Mar/ }).click();
  await expect(page.getByText('Thursday 7 March')).toBeVisible();
  await page.getByText('Your details').first().click();
  await expect(page.locator('input[type=date]')).toHaveCount(1);
});

test('therapist link: SOS stays in reach, and a row alone sends nothing', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  const headers = { Authorization: `Bearer ${token}` };
  const staff = (await (await request.get('/api/staff', { headers })).json()).find((s: { role: string; is_active: boolean }) => s.role === 'therapist' && s.is_active);
  const { token: link } = await (await request.post(`/api/staff/${staff.id}/link`, { headers })).json();
  const sent: string[] = [];
  await page.route('**/issues', (r) => { sent.push(r.request().url()); return r.continue(); });
  await page.goto(`/l/${link}?date=2030-03-04`);
  const sos = page.getByRole('button', { name: 'Raise an issue or SOS' });
  await expect(sos).toBeInViewport();
  await sos.click();
  await page.getByText('A note for the admin').click();
  await expect(page.getByRole('button', { name: 'Type your note first' })).toBeDisabled();
  expect(sent).toHaveLength(0);
  await page.getByLabel('A few words (optional)').fill('Tap is stuck');
  await page.getByRole('button', { name: 'Send to the centre' }).click();
  await expect.poll(() => sent.length).toBe(1);
});

test('a dead link names the centre', async ({ page }) => {
  await page.goto('/l/nothingnothingnothingnothing');
  await expect(page.getByText('This link is no longer valid')).toBeVisible();
  await expect(page.getByRole('heading')).not.toHaveText('');
});
