import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// An expired sign-in sent Save to the sign-in page with no word why, and the change was lost (#1073).
test('a save refused by an expired sign-in is sent again after signing back in', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  const headers = { Authorization: `Bearer ${token}` };
  const room = await (await request.post('/api/rooms', { headers, data: { name: 'E2E Expired Room', amenities: [] } })).json();
  try {
    await page.addInitScript((t) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); } }, token);
    await page.goto('/admin/rooms');
    await page.evaluate((id) => {
      localStorage.setItem('authToken', 'expired');
      void fetch(`/api/rooms/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'E2E Expired Room saved', amenities: [] }) });
    }, room.id);
    await expect(page.getByText('Signed out. Sign in again to save.')).toBeVisible();
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('demo1234');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Signed in again and saved.')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/rooms/);
    const rooms = await (await request.get('/api/rooms', { headers })).json();
    expect(rooms.find((r: { id: string }) => r.id === room.id).name).toBe('E2E Expired Room saved');
  } finally {
    await request.delete(`/api/rooms/${room.id}`, { headers });
  }
});
