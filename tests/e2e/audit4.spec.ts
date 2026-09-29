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
