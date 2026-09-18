/**
 * After the setup wizard, the centre can work.
 *
 * This checks the outcome, not the screens, so it survives the wizard being
 * rewritten (#60): once the wizard's save has gone through, the centre has
 * therapies, rooms, therapists, opening hours and a timezone, setup is marked
 * complete, and the first day sheet prints under the centre's own name.
 *
 * It sends exactly what the wizard sends on "Keep the example data", then puts
 * the centre's settings back. The "start empty" path is not run here: today it
 * deletes the demo centre every other test needs, and #60 is changing what it
 * keeps. Add it when #60 lands.
 *
 * Needs a running server and its database: API_BASE and DATABASE_URL.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'demo1234';

async function main() {
  const prisma = new PrismaClient();
  const login = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  assert.ok(login.ok, `Sign-in failed with ${login.status}. Is the server seeded?`);
  const { token } = await login.json();
  const api = (path: string, init: RequestInit = {}) => fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });

  await requireDemoData(prisma);
  const before = await (await api('/settings')).json();
  try {
    // The wizard's own payload: step 1, step 2, then the demo-data choice.
    const wizard = {
      centre_name: 'Onboarding Test Centre',
      address: null,
      timezone: 'Europe/Prague',
      opening_time: '09:00',
      closing_time: '20:00',
      slot_minutes: 30,
      working_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      logo: null,
      setup_complete: true,
    };
    const saved = await api('/settings', { method: 'PUT', body: JSON.stringify(wizard) });
    assert.ok(saved.ok, `The wizard's save was refused: ${saved.status} ${await saved.text()}`);

    const after = await (await api('/settings')).json();
    assert.equal(after.setup_complete, true, 'Setup is not marked complete');
    assert.equal(after.timezone, 'Europe/Prague', 'The timezone was not kept');
    assert.equal(after.opening_time, '09:00');
    assert.equal(after.closing_time, '20:00');
    assert.equal(after.working_days.length, 7, 'The working days were not kept');

    assert.ok(await prisma.therapy.count() > 0, 'The centre has no therapies');
    assert.ok(await prisma.therapyRoom.count({ where: { is_active: true } }) > 0, 'The centre has no rooms');
    assert.ok(await prisma.staff.count({ where: { is_active: true } }) > 0, 'The centre has no therapists');

    const sheet = await api('/daily-schedule-pdf?date=2030-01-16');
    assert.ok(sheet.ok, `The first day sheet did not print: ${sheet.status}`);
    const text = execFileSync('pdftotext', ['-', '-'], { input: Buffer.from(await sheet.arrayBuffer()) }).toString();
    assert.match(text, /Onboarding Test Centre/, 'The day sheet does not carry the centre\'s name');

    console.log('Onboarding: settings kept, setup complete, centre has what it needs, day sheet prints.');
  } finally {
    const { centre_name, address, timezone, opening_time, closing_time, slot_minutes, working_days, logo, setup_complete } = before;
    await api('/settings', {
      method: 'PUT',
      body: JSON.stringify({ centre_name, address, timezone, opening_time, closing_time, slot_minutes, working_days, logo, setup_complete }),
    });
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
