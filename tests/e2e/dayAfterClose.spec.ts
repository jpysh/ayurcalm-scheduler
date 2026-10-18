import { test, expect } from '@playwright/test';

/** #951: after the centre closes, Day opens on the day Staff, link pages and Print use. Fixed 2030 clock, centre on Asia/Kolkata. */
test.use({ viewport: { width: 375, height: 812 } });

for (const [name, at, shown] of [
  ['after close (21:00 on 12 Mar)', '2030-03-12T15:30:00Z', 'Wed 13 Mar'],
  ['before close (06:43 on 12 Mar)', '2030-03-12T01:13:00Z', 'Tue 12 Mar'],
] as const) {
  test(`Day opens on the planning day ${name}`, async ({ page }) => {
    await page.clock.install({ time: new Date(at) });
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('demo1234');
    await page.getByLabel('Password').press('Enter');
    await page.waitForURL(/\/admin/);
    await expect.poll(async () => page.locator('[aria-pressed=true]').first().getAttribute('aria-label')).toBe(shown);
  });
}
