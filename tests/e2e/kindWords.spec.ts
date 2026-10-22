import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// People are on leave and rooms are out of use; "not available" is only Availability's umbrella (#1126).
test('Staff and Rooms say each kind\'s own word', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  for (const path of ['/admin/rooms', '/admin/team']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).not.toContainText(/Not available/);
  }
});
