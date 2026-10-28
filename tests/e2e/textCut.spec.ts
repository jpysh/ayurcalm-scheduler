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
  await page.getByRole('dialog').getByRole('button', { name: /^Staff/ }).click();
  await page.waitForTimeout(800);
  expect(await page.evaluate(cutText), 'team').toEqual([]);
});

// Availability's list and picker, rebuilt in #695. The form is left out: its fields scroll
// behind the fixed Save buttons, which the check reads as words run together.
test('At 200% text Availability and its picker show every word whole', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/timeoff');
  await big(page);
  await page.waitForTimeout(800);
  expect(await page.evaluate(cutText), 'availability').toEqual([]);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button').first().click();
  await page.getByRole('dialog').last().getByText('Show staff').click();
  await page.getByRole('dialog').last().getByRole('checkbox').first().click();
  expect(await page.evaluate(cutText), 'picker').toEqual([]);
});

// Its two date boxes sat two to a row whatever the text size, and "Choose" broke into three lines (#794).
test('At 200% text Guest rooms shows every word whole', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/guestrooms');
  await big(page);
  await page.waitForTimeout(800);
  expect(await page.evaluate(cutText), 'guest rooms').toEqual([]);
});

// A row's time or count squeezed its name to a few letters, and Search's segments overlapped (#855).
test('At 200% text Events, Diet plans, Therapies and Search show every word whole', async ({ page }) => {
  await signIn(page);
  for (const tab of ['events', 'diet', 'therapies']) {
    await page.goto(`/admin/${tab}`);
    await big(page);
    await page.waitForTimeout(800);
    expect(await page.evaluate(cutText), tab).toEqual([]);
  }
  await page.goto('/admin/schedule');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Search/ }).click();
  await page.getByRole('navigation', { name: 'Search' }).getByRole('textbox').fill('anj');
  await big(page);
  await page.waitForTimeout(800);
  expect(await page.evaluate(cutText), 'search').toEqual([]);
});

// A long therapy name ran past the card's edge (#1151).
test('At 200% text the Log shows every word whole', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/log');
  await big(page);
  await page.waitForTimeout(800);
  for (const y of [0, 1e6]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(300);
    expect(await page.evaluate(cutText), `log, scrolled to ${y}`).toEqual([]);
  }
});

// Found by the 27 Oct walk, not by this file (#1335): Change day's choices ran together (#1331), the therapist link's
// week strip overlapped (#1332), Settings > Therapies lost its title's end (#1333), and the rules read a word a line (#1334).
test('At 200% text Change day, a therapist link and Settings screens show every word whole', async ({ page, request }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Change day/ }).click();
  await big(page);
  await page.waitForTimeout(800);
  expect(await page.evaluate(cutText), 'change day').toEqual([]);
  for (const row of ['Therapies', 'What needs you']) {
    await page.goto('/admin/settings');
    await page.getByRole('button', { name: new RegExp(`^${row}`) }).first().click();
    await big(page);
    await page.waitForTimeout(800);
    expect(await page.evaluate(cutText), row).toEqual([]);
  }
  const auth = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('authToken'))}` };
  const staff = await (await request.get('/api/staff', { headers: auth })).json();
  const { token } = await (await request.post(`/api/staff/${staff.find((s: { role: string; is_active: boolean }) => s.role === 'therapist' && s.is_active).id}/link`, { headers: auth })).json();
  await page.goto(`/l/${token}`);
  await big(page);
  await page.waitForTimeout(800);
  expect(await page.evaluate(cutText), 'therapist link').toEqual([]);
});
