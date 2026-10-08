import { test, expect } from '@playwright/test';

/** #599: a chosen day is that day on every phone, wherever it is, whatever zone the centre keeps. */
test.use({ viewport: { width: 375, height: 812 } });

for (const zone of ['Pacific/Auckland', 'Europe/Prague', 'America/New_York']) {
  test.describe(`chosen day, phone in ${zone}`, () => {
    test.use({ timezoneId: zone });
    test('Change day shows the day chosen', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill('admin@example.com');
      await page.getByLabel('Password').fill('demo1234');
      await page.getByLabel('Password').press('Enter');
      await page.waitForURL(/\/admin/);
      const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10); // a few days on is a day in every zone
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('dialog').last().getByRole('button', { name: /^Change day/ }).click();
      await page.locator('input[type=date]').last().fill(day);
      const want = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
      await expect.poll(async () => { await page.evaluate(() => window.scrollTo(0, 0)); return page.locator('[aria-pressed=true]').first().getAttribute('aria-label'); }).toBe(want);
    });
  });
}
