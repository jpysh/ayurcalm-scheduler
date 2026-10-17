import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// A refused room delete said "Deleted" and then removed the room's out-of-use entries from the browser (#876).
test('a refused delete says why and leaves the room and its leave alone', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  const headers = { Authorization: `Bearer ${token}` };
  const room = await (await request.post('/api/rooms', { headers, data: { name: 'E2E Refused Room', amenities: [] } })).json();
  const off = await (await request.post('/api/timeoff', { headers, data: { entity_type: 'room', entity_id: room.id, date: '2030-03-04', description: 'Out of use', plan: false } })).json();
  try {
    await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
    await page.route(`**/api/rooms/${room.id}`, (r) => r.request().method() === 'DELETE'
      ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Delete failed' }) })
      : r.continue());
    await page.goto('/admin/rooms');
    await page.getByRole('button', { name: /^E2E Refused Room/ }).click();
    await page.getByRole('button', { name: /^Details/ }).click();
    await page.getByRole('button', { name: 'Delete this room' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Delete failed')).toBeVisible();
    await expect(page.getByText('Deleted', { exact: true })).toHaveCount(0);
    const left = await (await request.get('/api/timeoff', { headers })).json();
    expect(left.some((h: { id: string }) => h.id === off.id)).toBe(true);
  } finally {
    await request.delete(`/api/rooms/${room.id}`, { headers });
  }
});
