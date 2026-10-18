import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

// At 200% text a long first name in a sheet title breaks with a hyphen, never bare mid-word (#918).
// Renames one resident for the test and puts the name back.
test('A long first name in a sheet title breaks with a hyphen', async ({ page, request }) => {
  const { token } = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'demo1234' } })).json();
  const headers = { Authorization: `Bearer ${token}` };
  const pt = (await (await request.get('/api/patients', { headers })).json()).find((x: { name: string }) => x.name === 'Aditya Chatterjee');
  await request.put(`/api/patients/${pt.id}`, { headers, data: { name: 'Lakshminarayanan Chatterjee' } });
  try {
    await page.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; }); }, token);
    await page.goto('/admin/patients');
    await page.getByRole('button', { name: /^Lakshminarayanan/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Package/ }).click();
    await expect(page.getByRole('dialog').getByRole('heading')).toContainText('­');
  } finally {
    await request.put(`/api/patients/${pt.id}`, { headers, data: { name: 'Aditya Chatterjee' } });
  }
});
