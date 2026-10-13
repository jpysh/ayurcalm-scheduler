// Before and after shots for the Patients polish batch (#801): node scripts/uat-polish-patients.mjs <base url> <out dir> <prefix>
import { chromium } from '@playwright/test';
const [base, out, tag] = process.argv.slice(2);
const b = await chromium.launch();
for (const big of [false, true]) {
  const page = await (await b.newContext({ viewport: { width: 375, height: 812 }, baseURL: base })).newPage();
  await page.goto('/login'); await page.getByLabel('Email').fill('admin@example.com'); await page.getByLabel('Password').fill('demo1234'); await page.getByLabel('Password').press('Enter'); await page.waitForURL(/\/admin/);
  await page.goto('/admin/patients'); await page.waitForTimeout(1500);
  if (big) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const n = big ? '-200' : '';
  await page.screenshot({ path: `${out}/${tag}-list${n}.png`, fullPage: true });
  await page.getByRole('button').filter({ hasText: /Day \d+ of/ }).first().click(); await page.waitForTimeout(1500);
  const box = page.locator('[role=dialog] .overflow-y-auto').first();
  for (const [i, y] of [0, 700, 1400].entries()) { await box.evaluate((e, t) => { e.scrollTop = t; }, y); await page.waitForTimeout(200); await page.screenshot({ path: `${out}/${tag}-page${n}-${i}.png` }); }
}
await b.close();
