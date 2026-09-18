/**
 * A treatment worked by two therapists books both of them.
 *
 * Before this, the second therapist was invisible: not counted as busy, so they
 * could be booked elsewhere for the same hour, which is a double booking the
 * day sheet then prints as if it will happen. This goes through the API the
 * screens use, on a day in 2030:
 *
 *   - moving another treatment onto a co-therapist's hour is refused
 *   - auto-booking with that co-therapist named never lands in their hour
 *   - auto-booking a pair therapy gives it two therapists
 *   - auto-booking a pair therapy with only one qualified therapist is refused
 *
 * Needs a running server and its database: API_BASE and DATABASE_URL.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const TAG = 'Cotest';
const DAY = '2030-04-10';
const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'demo1234';
const allDay = Object.fromEntries(
  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]),
);

async function tidy(prisma: PrismaClient) {
  const patients = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patient.deleteMany({ where: { id: { in: patients } } });
  await prisma.staff.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapyRoom.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapy.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await requireDemoData(prisma);
    await tidy(prisma);

    const login = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    assert.ok(login.ok, `Sign-in failed with ${login.status}`);
    const { token } = await login.json();
    const call = (method: string, path: string, body: unknown) => fetch(`${API_BASE}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });

    const day = new Date(`${DAY}T00:00:00.000Z`);
    const plain = await prisma.therapy.create({ data: { name: `${TAG} Abhyanga`, required_amenities: [], duration_minutes: 60 } });
    const pair = await prisma.therapy.create({ data: { name: `${TAG} Pizhichil`, required_amenities: [], duration_minutes: 60, staff_required: 2 } });
    const lonely = await prisma.therapy.create({ data: { name: `${TAG} Navarakizhi`, required_amenities: [], duration_minutes: 60, staff_required: 2 } });
    const roomA = await prisma.therapyRoom.create({ data: { name: `${TAG} Room A`, amenities: [], weekly_schedule: allDay } });
    const roomB = await prisma.therapyRoom.create({ data: { name: `${TAG} Room B`, amenities: [], weekly_schedule: allDay } });
    const staff = (name: string, specializations: string[]) =>
      prisma.staff.create({ data: { name: `${TAG} ${name}`, gender: 'female', specializations, weekly_schedule: allDay } });
    const lead = await staff('Lead', [plain.id, pair.id, lonely.id]);
    const helper = await staff('Helper', [plain.id, pair.id]);
    const patient = (name: string) => prisma.patient.create({ data: { name: `${TAG} ${name}`, gender: 'female' } });
    const [p1, p2, p3, p4] = [await patient('One'), await patient('Two'), await patient('Three'), await patient('Four')];

    // Helper assists on a pair treatment at 10:00 in room A.
    await prisma.appointment.create({ data: {
      patient_id: p1.id, therapy_id: pair.id, staff_id: lead.id, co_staff_ids: [helper.id], room_id: roomA.id,
      scheduled_date: day, start_time: '10:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual',
    } });
    // And leads one of her own at 12:00 in room B.
    const hers = await prisma.appointment.create({ data: {
      patient_id: p2.id, therapy_id: plain.id, staff_id: helper.id, room_id: roomB.id,
      scheduled_date: day, start_time: '12:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual',
    } });

    // Moving hers onto the hour she is assisting is refused, by name.
    const moved = await call('PUT', `/appointments/${hers.id}`, { start_time: '10:00' });
    assert.equal(moved.status, 409, 'a co-therapist was booked elsewhere in the hour she is assisting');
    const refusal = await moved.json();
    assert.equal(refusal.reason, 'STAFF_BUSY');
    assert.match(refusal.message, /Helper/);
    assert.equal((await prisma.appointment.findUnique({ where: { id: hers.id } }))?.start_time, '12:00', 'the refused move was written anyway');

    // Auto-booking with her named, asked for 10:00 to 11:00, finds nothing there.
    const auto = await call('POST', '/appointments', {
      patient_id: p3.id, therapy_id: plain.id, total_sessions: 1, preferred_staff_id: helper.id,
      preferred_time_range: { start: '10:00', end: '11:00' }, start_date: DAY, end_date: DAY, now: '2030-01-01T00:00:00.000Z',
    });
    const autoBody = await auto.json();
    const autoAt = autoBody.appointments?.[0]?.start_time;
    assert.notEqual(autoAt, '10:00', 'auto-booking put the co-therapist in two places at 10:00');

    // A pair therapy is booked with two therapists.
    const paired = await call('POST', '/appointments', {
      patient_id: p4.id, therapy_id: pair.id, total_sessions: 1,
      preferred_time_range: { start: '14:00', end: '15:00' }, start_date: DAY, end_date: DAY, now: '2030-01-01T00:00:00.000Z',
    });
    assert.equal(paired.status, 201, `auto-booking a pair therapy failed: ${await paired.clone().text()}`);
    const booked = (await paired.json()).appointments[0];
    const team = [booked.staff_id, ...booked.co_staff_ids];
    assert.equal(new Set(team).size, 2, 'a pair therapy was booked without two different therapists');

    // Only one therapist is trained in this one, so it cannot be staffed.
    const refused = await call('POST', '/appointments', {
      patient_id: p4.id, therapy_id: lonely.id, total_sessions: 1,
      preferred_time_range: { start: '16:00', end: '17:00' }, start_date: DAY, end_date: DAY, now: '2030-01-01T00:00:00.000Z',
    });
    assert.notEqual(refused.status, 201, 'a therapy nobody could fully staff was booked short-handed');
    assert.equal(await prisma.appointment.count({ where: { therapy_id: lonely.id } }), 0);

    console.log('Co-therapists: counted as busy, booked in pairs, and never booked short-handed.');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
