import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * What the third admin audit (#265) found broken at 375px, one check each.
 * None depends on the hour: they read the seeded centre, not the day's rows.
 */
test.use({ viewport: { width: 375, height: 812 } });

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('demo1234');
  await page.getByLabel('Password').press('Enter');
  await page.waitForURL(/\/admin/);
}

const menuTo = async (page: Page, name: RegExp) => {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name }).click();
};

/** Nothing sits on top of it: a tap at its centre lands on it. */
const onTop = (l: Locator) => l.evaluate((el) => {
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && (el === hit || el.contains(hit));
});

/** No part of the open sheet runs past the phone's right edge. */
const fitsWidth = (page: Page) => page.getByRole('dialog').last().evaluate((d) =>
  [...d.querySelectorAll('*')].every((e) => e.getBoundingClientRect().right <= innerWidth + 1));

test('B1: Book and search are not covered by a floating button', async ({ page }) => {
  await signIn(page);
  expect(await onTop(page.getByRole('button', { name: 'Book a treatment' }))).toBe(true);
  await page.getByRole('button', { name: /^Search/ }).click();
  expect(await onTop(page.getByRole('button', { name: /^Cancel/ }))).toBe(true);
});

test('B2: resident details never say "Not staying" for someone in house', async ({ page }) => {
  await signIn(page);
  await menuTo(page, /^Patients/);
  await page.getByRole('button', { name: /Day \d+ of \d+/ }).first().click();
  // Held open: the empty answer used to show until the stays arrived.
  await page.route('**/stays', async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.continue(); });
  await page.getByRole('button', { name: /^Details/ }).last().click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet).not.toContainText('Not staying');
  await expect(sheet).toContainText(/\d+ \w{3} to \d+ \w{3}/, { timeout: 10000 });
  await expect(sheet).not.toContainText('Not staying');
});

test('B3: diet plans fit the phone', async ({ page }) => {
  await signIn(page);
  await menuTo(page, /^Diet/);
  await page.getByRole('button', { name: /^Plans$/ }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /^New plan/ })).toBeVisible();
  expect(await fitsWidth(page)).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: /›$/ }).first().click();
  await expect(page.getByLabel('Plan name')).not.toHaveValue('');
  expect(await fitsWidth(page)).toBe(true);
});

test('B4: people with access fit the phone', async ({ page }) => {
  await signIn(page);
  await menuTo(page, /^Settings/);
  await page.getByRole('button', { name: /^People with access/ }).click();
  await expect(page.getByRole('dialog')).toContainText('admin@example.com');
  expect(await fitsWidth(page)).toBe(true);
});

test('Help · WhatsApp sits after Settings in the menu, only with a number', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  const headers = { Authorization: `Bearer ${token}` };
  const current = await (await request.get('/api/settings', { headers })).json();
  const was = current.support_whatsapp ?? '';
  // PUT takes the whole settings object.
  const set = async (n: string) => expect((await request.put('/api/settings', { headers, data: { ...current, support_whatsapp: n } })).ok()).toBe(true);
  try {
    await set('420777558262');
    await signIn(page);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const tiles = page.getByRole('dialog').locator('.grid-cols-2 > *');
    await expect(page.getByRole('link', { name: /^Help · WhatsApp/ })).toBeVisible();
    const names = await tiles.allInnerTexts();
    const at = names.findIndex((t) => t.startsWith('Settings'));
    expect(names[at + 1]).toMatch(/^Help · WhatsApp/);
    await expect(tiles.nth(at + 1)).toHaveAttribute('href', 'https://wa.me/420777558262');
    await set('');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('Settings', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Help · WhatsApp')).toHaveCount(0);
  } finally {
    await set(was);
  }
});
