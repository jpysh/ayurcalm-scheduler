import { test, expect, type Page } from '@playwright/test';
import { cutText } from '../../scripts/cutText.mjs';

/** At 200% text on a phone, no words are cut or run into each other (#665). Nightly, not @smoke. */
test.use({ viewport: { width: 375, height: 812 } });

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('demo1234');
  await page.getByLabel('Password').press('Enter');
  await page.waitForURL(/\/admin/);
}
const big = (page: Page) => page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });

test('At 200% text the day and the team show every word whole', async ({ page }) => {
  await signIn(page);
  await big(page);
  await page.waitForTimeout(500);
  for (const y of [0, 1e6]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(300);
    expect(await page.evaluate(cutText), `day, scrolled to ${y}`).toEqual([]);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Team/ }).click();
  await page.waitForTimeout(800);
  expect(await page.evaluate(cutText), 'team').toEqual([]);
});
