import { test, expect } from '@playwright/test';

async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.setItem('authRole', 'Admin');
    localStorage.setItem('authUser', 'admin');
  });
  await page.goto('/admin/schedule');
  await expect(page).toHaveURL(/\/admin\/schedule/);
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    // Seed data that mirrors UI mocks, in API shape
    const therapies = [
      { id: 't1', name: 'Abhyanga', required_amenities: ['Massage Table'], duration_minutes: 60, requires_gender_match: true },
      { id: 't2', name: 'Nasya Therapy', required_amenities: ['Steam'], duration_minutes: 45, requires_gender_match: false },
      { id: 't3', name: 'Shirodhara', required_amenities: ['Shirodhara Stand'], duration_minutes: 90, requires_gender_match: true },
    ];
    const staff = [
      { id: 's1', name: 'Dr. Priya Kumar', gender: 'female', specializations: ['t1','t2','t3'], phone: '+1234567890', weekly_schedule: {} },
      { id: 's2', name: 'Dr. Raj Patel', gender: 'male', specializations: ['t1','t3'], phone: '+1234567891', weekly_schedule: {} },
      { id: 's3', name: 'Dr. Anjali Sharma', gender: 'female', specializations: ['t3'], phone: '+1234567892', weekly_schedule: {} },
    ];
    const rooms = [
      { id: 'r1', name: 'Treatment Room 1', amenities: ['Massage Table','Shower','Steam'], is_active: true, weekly_schedule: {} },
      { id: 'r2', name: 'Treatment Room 2', amenities: ['Massage Table','Shower'], is_active: true, weekly_schedule: {} },
      { id: 'r3', name: 'Ayurvedic Suite', amenities: ['Shirodhara Stand','Steam','Shower','Massage Table'], is_active: true, weekly_schedule: {} },
    ];

    if (url.endsWith('/api/health')) return ok({ status: 'ok' });
    if (url.endsWith('/api/therapies') && method === 'GET') return ok(therapies);
    if (url.endsWith('/api/staff') && method === 'GET') return ok(staff);
    if (url.endsWith('/api/rooms') && method === 'GET') return ok(rooms);
    if (url.endsWith('/api/patients') && method === 'GET') return ok([]);
    if (url.includes('/api/appointments') && method === 'GET') return ok([]);
    if (url.includes('/api/timeoff') && method === 'GET') return ok([]);
    if (url.endsWith('/api/holidays') && method === 'GET') return ok([]);

    // Inline edit saves
    if (/\/api\/staff\/.+/.test(url) && method === 'PUT') {
      const payload = await route.request().postDataJSON();
      return ok({ id: url.split('/').pop(), name: payload.name, gender: payload.gender, specializations: payload.specializations, phone: payload.phone });
    }
    if (/\/api\/rooms\/.+/.test(url) && method === 'PUT') {
      const payload = await route.request().postDataJSON();
      return ok({ id: url.split('/').pop(), name: payload.name, amenities: payload.amenities, is_active: !!payload.is_active });
    }
    if (/\/api\/therapies\/.+/.test(url) && method === 'PUT') {
      const payload = await route.request().postDataJSON();
      return ok({ id: url.split('/').pop(), name: payload.name, required_amenities: payload.required_amenities, duration_minutes: payload.duration_minutes, requires_gender_match: !!payload.requires_gender_match });
    }

    // Create flows used by existing tests
    if (url.endsWith('/api/staff') && method === 'POST') {
      const payload = await route.request().postDataJSON();
      return ok({ id: 's-new', name: payload.name, gender: payload.gender, specializations: payload.specializations, phone: payload.phone });
    }
    if (url.endsWith('/api/rooms') && method === 'POST') {
      const payload = await route.request().postDataJSON();
      return ok({ id: 'r-new', name: payload.name, amenities: payload.amenities, is_active: true });
    }
    if (url.endsWith('/api/therapies') && method === 'POST') {
      const payload = await route.request().postDataJSON();
      return ok({ id: 't-new', name: payload.name, required_amenities: payload.required_amenities, duration_minutes: payload.duration_minutes, requires_gender_match: !!payload.requires_gender_match });
    }
    if (url.endsWith('/api/timeoff') && method === 'POST') {
      const payload = await route.request().postDataJSON();
      return ok({ id: 'h-new', date: payload.date, entity_type: payload.entity_type, entity_id: payload.entity_id, description: payload.description });
    }

    // Fallback
    return ok({});
  });
});

test('tabs render and navigate', async ({ page }) => {
  await loginAdmin(page);
  await expect(page.getByRole('tab', { name: 'Staff' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Rooms' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Therapies' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'TimeOff' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Patients' })).toBeVisible();

  await page.getByRole('tab', { name: 'Staff' }).click();
  await expect(page.getByText('Staff Management')).toBeVisible({ timeout: 15000 });
  await page.getByRole('tab', { name: 'Rooms' }).click();
  await expect(page.getByText('Room Management')).toBeVisible({ timeout: 15000 });
  await page.getByRole('tab', { name: 'Therapies' }).click();
  await expect(page.getByText('Therapy Management')).toBeVisible({ timeout: 15000 });
  await page.getByRole('tab', { name: 'TimeOff' }).click();
  await expect(page.getByText(/Time Off/)).toBeVisible({ timeout: 15000 });
});

test('add staff flow', async ({ page }) => {
  await loginAdmin(page);
  await page.getByRole('tab', { name: 'Staff' }).click();
  await expect(page.getByText('Staff Management')).toBeVisible();
  await page.getByRole('button', { name: 'Add Staff' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Staff' });
  await expect(dialog).toBeVisible();
  const inputs = dialog.getByRole('textbox');
  await inputs.nth(0).fill('QA Staff');
  await inputs.nth(1).fill('Ayur, Panchakarma');
  await inputs.nth(2).fill('9999999999');
  await inputs.nth(3).fill('Mon-Fri 9-5');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const staffPanel = page.getByRole('tabpanel', { name: 'Staff' });
  await expect(staffPanel.getByRole('row').filter({ hasText: 'QA Staff' })).toBeVisible();
});

test('add room flow', async ({ page }) => {
  await loginAdmin(page);
  await page.getByRole('tab', { name: 'Rooms' }).click();
  await expect(page.getByText('Room Management')).toBeVisible();
  await page.getByRole('button', { name: 'Add Room' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Room' });
  await expect(dialog).toBeVisible();
  const inputs = dialog.getByRole('textbox');
  await inputs.nth(0).fill('QA Room');
  await inputs.nth(1).fill('massage_table,shower');
  await inputs.nth(2).fill('Mon-Fri 9-5');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const roomsPanel = page.getByRole('tabpanel', { name: 'Rooms' });
  await expect(roomsPanel.getByRole('row').filter({ hasText: 'QA Room' })).toBeVisible();
});

test('add therapy flow', async ({ page }) => {
  await loginAdmin(page);
  await page.getByRole('tab', { name: 'Therapies' }).click();
  await expect(page.getByText('Therapy Management')).toBeVisible();
  await page.getByRole('button', { name: 'Add Therapy' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Therapy' });
  await expect(dialog).toBeVisible();
  const inputs = dialog.getByRole('textbox');
  await inputs.nth(0).fill('QA Therapy');
  await dialog.getByRole('spinbutton').fill('60');
  await inputs.nth(1).fill('massage_table');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const therapiesPanel = page.getByRole('tabpanel', { name: 'Therapies' });
  await expect(therapiesPanel.getByRole('row').filter({ hasText: 'QA Therapy' })).toBeVisible();
});

test('add center timeoff flow', async ({ page }) => {
  await loginAdmin(page);
  await page.getByRole('tab', { name: 'TimeOff' }).click();
  await expect(page.getByText(/Time Off/)).toBeVisible();
  await page.getByRole('button', { name: 'Add Time Off' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add TimeOff' });
  await expect(dialog).toBeVisible();
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const startVal = `${yyyy}-${mm}-${dd}T09:00`;
  const endVal = `${yyyy}-${mm}-${dd}T10:00`;
  const dtInputs = dialog.locator('input[type="datetime-local"]');
  await expect(dtInputs.first()).toBeVisible();
  await dtInputs.first().evaluate((el, val) => {
    (el as HTMLInputElement).value = val as string;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, startVal);
  await dtInputs.nth(1).evaluate((el, val) => {
    (el as HTMLInputElement).value = val as string;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, endVal);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
});

test('popups open/cancel', async ({ page }) => {
  await loginAdmin(page);
  await page.getByRole('tab', { name: 'Staff' }).click();
  await page.getByRole('button', { name: 'Add Staff' }).click();
  const staffDialog = page.getByRole('dialog', { name: 'Add Staff' });
  await expect(staffDialog).toBeVisible();
  await staffDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(staffDialog).toBeHidden();

  await page.getByRole('tab', { name: 'Rooms' }).click();
  await page.getByRole('button', { name: 'Add Room' }).click();
  const roomDialog = page.getByRole('dialog', { name: 'Add Room' });
  await expect(roomDialog).toBeVisible();
  await roomDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(roomDialog).toBeHidden();
});

test('inline edit staff saves updated name', async ({ page }) => {
  await loginAdmin(page);
  await page.getByRole('tab', { name: 'Staff' }).click();
  await expect(page.getByText('Staff Management')).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Staff' }).getByRole('row').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid^="edit-staff-"]').first()).toBeVisible();
  await page.locator('[data-testid^="edit-staff-"]').first().click();
  const staffPanel = page.getByRole('tabpanel', { name: 'Staff' });
  await staffPanel.locator('[data-testid^="staff-name-"]').first().fill('Dr. Priya QA');
  await staffPanel.locator('tr:has([data-testid^="staff-name-"]) button:has-text("Save")').first().click();
  await expect(page.getByRole('tabpanel', { name: 'Staff' }).getByRole('row').filter({ hasText: 'Dr. Priya QA' })).toBeVisible();
});

test('inline edit room updates status to Maintenance', async ({ page }) => {
  await loginAdmin(page);
  await page.getByRole('tab', { name: 'Rooms' }).click();
  await expect(page.getByText('Room Management')).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Rooms' }).getByRole('row').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid^="edit-room-"]').first()).toBeVisible();
  await page.locator('[data-testid^="edit-room-"]').first().click();
  await page.locator('[data-testid^="room-status-"]').first().click();
  await page.getByRole('option', { name: 'Maintenance' }).click();
  const roomsPanel = page.getByRole('tabpanel', { name: 'Rooms' });
  await roomsPanel.locator('tr:has([data-testid^="room-status-"]) button:has-text("Save")').first().click();
  await expect(page.getByRole('tabpanel', { name: 'Rooms' }).getByRole('row').filter({ hasText: 'Maintenance' })).toBeVisible();
});

test('inline edit therapy updates duration and gender requirement', async ({ page }) => {
  await loginAdmin(page);
  await page.getByText('Therapies').click();
  await expect(page.getByText('Therapy Management')).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Therapies' }).getByRole('row').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid^="edit-therapy-"]').first()).toBeVisible();
  await page.locator('[data-testid^="edit-therapy-"]').first().click();
  await page.locator('[data-testid^="therapy-duration-"]').first().fill('90');
  await page.locator('[data-testid^="therapy-gender-"]').first().click();
  await page.getByRole('option', { name: 'Required', exact: true }).click();
  const therapiesPanel = page.getByRole('tabpanel', { name: 'Therapies' });
  await therapiesPanel.locator('tr:has([data-testid^="therapy-duration-"]) button:has-text("Save")').first().click();
  const abhyangaRow = page.getByRole('tabpanel', { name: 'Therapies' }).getByRole('row').filter({ hasText: 'Abhyanga' }).first();
  await expect(abhyangaRow).toBeVisible();
  await expect(abhyangaRow).toContainText('90');
  await expect(abhyangaRow).toContainText('Required');
});

test('login success routes to admin dashboard', async ({ page }) => {
  await page.unroute('**/api/**');
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.endsWith('/api/health')) return ok({ status: 'ok' });
    return ok({});
  });
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('admin123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin\/schedule/);
});

test('staff schedule shows appointment and WhatsApp Admin', async ({ page }) => {
  await page.unroute('**/api/**');
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    const staff = [{ id: 's1', name: 'Therapist A' }];
    const patients = [{ id: 'p1', name: 'Patient X' }];
    const therapies = [{ id: 't1', name: 'Abhyanga', duration_minutes: 60 }];
    const rooms = [{ id: 'r1', name: 'Room 1', amenities: ['Massage Table'] }];
    if (url.endsWith('/api/staff') && method === 'GET') return ok(staff);
    if (url.includes('/api/appointments') && method === 'GET') return ok([{ id: 'a1', patient_id: 'p1', therapy_id: 't1', staff_id: 's1', room_id: 'r1', scheduled_date: new Date().toISOString().slice(0,10), start_time: '09:00', duration_minutes: 60 }]);
    if (url.endsWith('/api/patients') && method === 'GET') return ok(patients);
    if (url.endsWith('/api/therapies') && method === 'GET') return ok(therapies);
    if (url.endsWith('/api/rooms') && method === 'GET') return ok(rooms);
    return ok({});
  });
  await page.goto('/staff/token-abc');
  await expect(page.getByText('Your Schedule')).toBeVisible();
  await expect(page.getByText('Abhyanga')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'WhatsApp Admin' })).toBeVisible();
});
