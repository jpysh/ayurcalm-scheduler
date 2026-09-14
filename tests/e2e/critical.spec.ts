import { test, expect, type Page } from '@playwright/test';

/**
 * The paths a centre cannot work without: signing in, reaching every tab, and
 * printing the day sheet. Needs a running install with the demo data.
 */
const ADMIN = { email: 'admin@example.com', password: 'demo1234' };

async function signIn(page: Page, password = ADMIN.password) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(password);
  // Enter, not a click: that is how people sign in.
  await page.getByLabel('Password').press('Enter');
}

/** A fresh install sends the admin through the setup wizard once. */
async function passSetupIfShown(page: Page) {
  await page.waitForURL(/\/(setup|admin)/);
  if (!page.url().includes('/setup')) return;
  await page.getByLabel('Centre name').fill('Test Centre');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Keep the example data for now' }).click();
  await page.waitForURL(/\/admin/);
}

// Tabs keep the last panel mounted while switching, so ask for the open one.
const activePanel = (page: Page) => page.locator('[role=tabpanel][data-state=active]');

/** A click while the previous tab is still loading can be lost, so retry until selected. */
async function openTab(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1000 });
  }).toPass({ timeout: 15000 });
}

test('wrong password stays on the login page', async ({ page }) => {
  await signIn(page, 'not-the-password');
  await expect(page.getByText(/invalid/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('signed-out visit to a tab goes to login', async ({ page }) => {
  await page.goto('/admin/patients');
  await expect(page).toHaveURL(/\/login/);
});

test('admin signs in with Enter and every tab shows its content', async ({ page }) => {
  await signIn(page);
  await passSetupIfShown(page);
  for (const [tab, text] of [
    ['Staff', 'Staff Management'],
    ['Rooms', 'Room Management'],
    ['Therapies', 'Therapy Management'],
    ['Diet', 'Diet Management'],
    ['Time off', 'Time Off'],
    ['Events', 'Events'],
    ['Patients', 'Patient Management'],
    ['Ailments', 'coming soon'],
    ['Settings', 'Centre details'],
    ['Schedule', 'Schedule'],
  ]) {
    await openTab(page, tab);
    await expect(activePanel(page)).toContainText(text, { timeout: 15000 });
  }
  // A seeded install has patients; an empty table means the API is not answering.
  await openTab(page, 'Patients');
  await expect(activePanel(page).getByRole('row').nth(5)).toBeVisible();
});

test('day sheet PDF prints for today', async ({ page, request }) => {
  await signIn(page);
  await passSetupIfShown(page);
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  const today = new Date().toISOString().slice(0, 10);
  const res = await request.get(`/api/daily-schedule-pdf?date=${today}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
  const body = await res.body();
  expect(body.subarray(0, 4).toString()).toBe('%PDF');
  // The seed books today, so the sheet has a table, not the "no activities" page.
  expect(body.length).toBeGreaterThan(5000);
});
