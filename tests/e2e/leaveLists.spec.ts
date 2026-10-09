import { test, expect } from '@playwright/test';

/** #601: Availability lists what is not available by the centre's day, not the phone's midnight (#695 dropped Upcoming and Past). */
test.use({ viewport: { width: 375, height: 812 } });

for (const zone of ['America/New_York', 'Pacific/Auckland', 'Asia/Kolkata']) {
  test.describe(`leave lists, phone in ${zone}`, () => {
    test.use({ timezoneId: zone });
    test("today's is listed, yesterday's is gone", async ({ page, request }) => {
      const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
      const headers = { Authorization: `Bearer ${token}` };
      const settings = await (await request.get('/api/settings', { headers })).json();
      const ymd = (offset: number) => new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA', { timeZone: settings.timezone });
      const staff = (await (await request.get('/api/staff', { headers })).json())[0];
      const make = async (iso: string, note: string) => (await (await request.post('/api/timeoff', { headers, data: { entity_type: 'staff', entity_id: staff.id, date: iso, start_date: `${iso}T00:00:00.000Z`, end_date: `${iso}T00:00:00.000Z`, description: note, plan: false } })).json()).id as string;
      const [a, b] = [await make(ymd(0), 'Zonetoday'), await make(ymd(-1), 'Zoneyesterday')];
      try {
        await page.goto('/login');
        await page.getByLabel('Email').fill('admin@example.com');
        await page.getByLabel('Password').fill('demo1234');
        await page.getByLabel('Password').press('Enter');
        await page.waitForURL(/\/admin/);
        await page.goto('/admin/timeoff');
        const table = page.getByTestId('timeoff-table');
        await expect(table).toContainText('Zonetoday');
        await expect(table).not.toContainText('Zoneyesterday');
      } finally {
        for (const id of [a, b]) await request.delete(`/api/timeoff/${id}`, { headers });
      }
    });
  });
}
