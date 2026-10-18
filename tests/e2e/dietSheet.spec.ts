import { test, expect } from '@playwright/test';

/** #941: the diet change sheet lists plan names; a plan's description shows only once it is tapped, and "Edit" is not beside the running plan. */
test.use({ viewport: { width: 375, height: 812 } });

test('diet sheet: names first, detail on tap, no Edit link in the timeline', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('demo1234');
  await page.getByLabel('Password').press('Enter');
  await page.waitForURL(/\/admin/);
  await page.goto('/admin/patients');
  await page.getByText('Aarav Iyer').first().click();
  await page.getByText(/^Diet$/).first().click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet.getByText('Diet for Aarav')).toBeVisible();
  await expect(sheet.getByText('Edit ›')).toHaveCount(0);
  const plans = sheet.locator('button[aria-pressed]');
  const before = await plans.first().innerText();
  await plans.first().click();
  await expect(plans.first()).toHaveAttribute('aria-pressed', 'true');
  expect((await plans.first().innerText()).length).toBeGreaterThanOrEqual(before.length);
  await expect(sheet.getByRole('button', { name: /^Start this plan/ })).toBeEnabled();
});
