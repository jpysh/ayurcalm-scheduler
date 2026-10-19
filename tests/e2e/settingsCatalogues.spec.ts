import { test, expect } from '@playwright/test';

/** #963: Therapies and Classes and events are one tap from Settings, not only the foot of Staff. */
test.use({ viewport: { width: 375, height: 812 } });

for (const [row, heading] of [['Therapies', /Therapies/], ['Classes and events', /^Events/]] as const) {
  test(`Settings reaches ${row}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('demo1234');
    await page.getByLabel('Password').press('Enter');
    await page.waitForURL(/\/admin/);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('dialog').last().getByRole('button', { name: /^Settings/ }).click();
    await page.getByRole('button', { name: new RegExp(`^${row}`) }).click();
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
  });
}
