import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// Phone B of a shared login cancelled a treatment; phone A still showed it after coming back (#898).
// The other phone's change is played by the answer to the day's read, so the seeded day is never changed.
test('coming back to the app re-reads the day', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  let gone: string | null = null;
  await page.route(/\/api\/appointments\?date=/, async (r) => {
    const res = await r.fetch();
    const rows = (await res.json()) as { id: string }[];
    await r.fulfill({ response: res, json: gone ? rows.filter((x) => x.id !== gone) : rows });
  });
  await page.goto('/admin/schedule');
  const first = page.getByRole('button', { name: /^\d\d:\d\d/ }).first();
  await expect(first).toBeVisible();
  const label = (await first.innerText()).replace(/\s+/g, ' ');
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const rows = (await (await request.get(`/api/appointments?date=${day}`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { id: string; start_time: string }[];
  gone = rows.find((x) => label.startsWith(x.start_time))!.id;
  const before = await page.getByRole('button', { name: /^\d\d:\d\d/ }).count();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('button', { name: /^\d\d:\d\d/ })).toHaveCount(before - 1);
});
