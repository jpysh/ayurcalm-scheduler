import { test, expect, type Page } from '@playwright/test';

/** What the fourth admin audit (#273) found, one check each, at 375px. */
test.use({ viewport: { width: 375, height: 812 } });

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('demo1234');
  await page.getByLabel('Password').press('Enter');
  await page.waitForURL(/\/admin/);
}
const toList = async (page: Page, list: string) => {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Team and rooms/ }).click();
  await page.getByRole('button', { name: list, exact: true }).click();
};

test('H1: rooms, therapists and therapies are plain rows with one sheet to add', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  const headers = { Authorization: `Bearer ${token}` };
  await signIn(page);
  await toList(page, 'Rooms');
  const panel = page.locator('[role=tabpanel][data-state=active]');
  await expect(panel).not.toContainText('Status');
  await expect(panel).not.toContainText('Amenities');
  await panel.getByRole('button', { name: /Add room/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Name').fill('E2E Room');
  await sheet.getByRole('button', { name: 'steam', exact: true }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByRole('button', { name: /^E2E Room/ })).toContainText('Has steam');
  const room = ((await (await request.get('/api/rooms', { headers })).json()) as { id: string; name: string }[]).find((r) => r.name === 'E2E Room');
  expect(room).toBeTruthy();
  await request.delete(`/api/rooms/${room!.id}`, { headers });

  for (const [list, word] of [['Therapists', 'Specializations'], ['Therapies', 'Required Amenities']] as const) {
    await page.keyboard.press('Escape');
    await page.goto('/admin/team');
    await page.getByRole('button', { name: list, exact: true }).click();
    await expect(panel).not.toContainText(word);
    await panel.getByRole('button', { name: /^\+ Add/ }).click();
    await expect(page.getByRole('dialog').getByLabel('Name')).toBeVisible();
  }
});

test('H2: Someone else… books any resident in a sheet, not the old Auto-Assign dialog', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Book a treatment' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Someone else/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Book someone else');
  await expect(page.getByText('Auto-Assign')).toHaveCount(0);
  await sheet.getByRole('button').nth(2).click();
  await sheet.getByLabel('Therapy').selectOption({ label: 'Thalam' });
  await expect(sheet.getByRole('button', { name: /^\d\d:\d\d/ }).first().or(sheet.getByText(/No free time/))).toBeVisible({ timeout: 15000 });
});

test('H3: a read-only trial says so on +, and hides Get started', async ({ page }) => {
  await page.route('**/api/public/support', async (route) => {
    const body = await (await route.fetch()).json();
    await route.fulfill({ json: { ...body, trial: { started_at: '2026-01-01', ends_at: '2026-01-31', read_only: true, plan: null, paid_until: null } } });
  });
  await signIn(page);
  await page.getByRole('button', { name: 'Book a treatment' }).click();
  await expect(page.locator('[data-sonner-toast]')).toContainText('free trial has ended');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Get started')).toHaveCount(0);
});

test('O1: Leave has Upcoming · Past · All, not a Filter popover', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Leave/ }).click();
  const panel = page.locator('[role=tabpanel][data-state=active]');
  await expect(panel.getByRole('button', { name: 'Upcoming' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('button', { name: 'Filter' })).toHaveCount(0);
});

test('O2: the print note keeps its words on one line, the other sheets under them', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: "Print the day's sheets" }).click();
  const words = page.locator('[data-sonner-toast]').getByText(/^Resident sheet printed/);
  await expect(words).toBeVisible({ timeout: 20000 });
  expect((await words.boundingBox())!.width).toBeGreaterThan(180);
  await expect(page.locator('[data-sonner-toast]').getByRole('button', { name: 'Doctor sheet' })).toBeVisible();
});

test("M1: a resident's link offers WhatsApp reception once the centre sets its own number", async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  const headers = { Authorization: `Bearer ${token}` };
  const current = await (await request.get('/api/settings', { headers })).json();
  const set = async (n: string) => expect((await request.put('/api/settings', { headers, data: { ...current, support_whatsapp: '420777558262', patient_support_whatsapp: n } })).ok()).toBe(true);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const resident = (await (await request.get(`/api/patients?resident_on=${today}`, { headers })).json())[0];
  const { token: link } = await (await request.post(`/api/patients/${resident.id}/link`, { headers })).json();
  try {
    await set('420777558262');
    await page.goto(`/l/${link}`);
    await expect(page.getByText(resident.name).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'WhatsApp reception' })).toHaveCount(0);
    await set('919876543210');
    await page.goto(`/l/${link}`);
    await expect(page.getByRole('link', { name: 'WhatsApp reception' })).toHaveAttribute('href', /wa\.me\/919876543210/);
  } finally {
    await request.put('/api/settings', { headers, data: current });
  }
});
