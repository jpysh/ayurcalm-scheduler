import { test, expect, type Page } from '@playwright/test';

/**
 * #1197: a stay's sheet reads the centre's day, never the phone's. Just before and just
 * after midnight in India, from phones in India, New York and Auckland, a stay arriving
 * on 11 March 2030 is "Arriving" on the 10th and "Arrived", with Leaves today and Did
 * not arrive, on the 11th. New York is still on the 10th and Auckland already on the 11th
 * at both instants, so a sheet that used the phone's date fails one of them.
 */
test.use({ viewport: { width: 375, height: 812 } });

const ADMIN = { email: 'admin@example.com', password: 'demo1234' };
const CLOCKS = [
  { at: '2030-03-10T23:30:00+05:30', begun: false },
  { at: '2030-03-11T00:30:00+05:30', begun: true },
];

async function openStay(page: Page, name: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByLabel('Password').press('Enter');
  await page.waitForURL(/\/admin/);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Search/ }).click();
  await page.keyboard.type(name);
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click();
  await page.getByRole('dialog').last().getByRole('button', { name: /^Dates/ }).click();
  return page.getByRole('dialog').last();
}

for (const zone of ['Asia/Kolkata', 'America/New_York', 'Pacific/Auckland']) {
  test.describe(`phone in ${zone}`, () => {
    test.use({ timezoneId: zone });
    for (const { at, begun } of CLOCKS) {
      test(`stay sheet at ${at.slice(11, 16)} IST`, async ({ page, request }) => {
        const { token } = await (await request.post('/api/auth/login', { data: ADMIN })).json();
        const headers = { Authorization: `Bearer ${token}` };
        const name = `Zone${Date.now().toString(36)}`;
        const made = await request.post('/api/patients', { headers, data: { name, gender: 'female', stay: { start_date: '2030-03-11', end_date: '2030-03-15' } } });
        expect(made.ok()).toBeTruthy();
        const { id } = await made.json();
        try {
          await page.clock.setFixedTime(new Date(at));
          const sheet = await openStay(page, name);
          await expect(sheet.getByText(begun ? 'Arrived' : 'Arriving', { exact: true })).toBeVisible();
          await expect(sheet.getByRole('button', { name: 'Did not arrive' })).toHaveCount(begun ? 1 : 0);
          await expect(sheet.getByRole('button', { name: 'Leaves today' })).toHaveCount(begun ? 1 : 0);
        } finally {
          await request.delete(`/api/patients/${id}`, { headers });
        }
      });
    }
  });
}
