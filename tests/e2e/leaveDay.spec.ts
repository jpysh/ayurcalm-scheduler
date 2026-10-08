import { test, expect, type Page } from '@playwright/test';

/** #597: a full-day leave is saved on the day chosen, whatever zone the admin's phone is in. */
test.use({ viewport: { width: 375, height: 812 } });

const DAY = '2030-04-17';
for (const zone of ['America/New_York', 'Pacific/Auckland', 'Asia/Kolkata']) {
  test.describe(`leave day, phone in ${zone}`, () => {
    test.use({ timezoneId: zone });
    test('the request carries the chosen day, and no other', async ({ page, request }) => {
      const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
      const headers = { Authorization: `Bearer ${token}` };
      const signIn = async (p: Page) => {
        await p.goto('/login');
        await p.getByLabel('Email').fill('admin@example.com');
        await p.getByLabel('Password').fill('demo1234');
        await p.getByLabel('Password').press('Enter');
        await p.waitForURL(/\/admin/);
      };
      await signIn(page);
      let sent: { start_date: string; end_date: string } | null = null;
      let madeId = '';
      page.on('response', async (r) => {
        if (/\/api\/timeoff$/.test(r.url()) && r.request().method() === 'POST') { sent = r.request().postDataJSON(); madeId = (await r.json()).id; }
      });
      await page.goto('/admin/timeoff');
      await page.getByRole('button', { name: /^(\+|Add)/ }).first().click();
      const sheet = page.getByRole('dialog').last();
      await sheet.getByText('Choose…').click();
      await page.getByRole('dialog').last().getByRole('button').filter({ hasNotText: /Closed for a day|Show/ }).first().click();
      await sheet.locator('input[type=date]').first().fill(DAY);
      await sheet.locator('input[type=date]').nth(1).fill(DAY);
      await sheet.getByRole('button', { name: 'Save, plan later' }).click();
      await expect.poll(() => sent).not.toBeNull();
      expect(sent!.start_date.slice(0, 10)).toBe(DAY);
      expect(sent!.end_date.slice(0, 10)).toBe(DAY);
      if (madeId) await request.delete(`/api/timeoff/${madeId}`, { headers });
    });
  });
}
