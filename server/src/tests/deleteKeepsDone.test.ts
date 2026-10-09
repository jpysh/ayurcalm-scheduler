/**
 * Deleting a therapist, room or therapy takes only its treatments from today on
 * (#567); done ones stay on the record, and a therapy that was given stays out
 * of use so they keep its name.
 *
 * A fixed past day and a fixed day in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Deltest';
const PAST = '2020-08-14';
const AHEAD = '2030-08-14';

async function tidy(prisma: PrismaClient) {
  const patients = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patient.deleteMany({ where: { id: { in: patients } } });
  await prisma.staff.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapyRoom.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapy.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }),
    })).json();
    const del = async (path: string) => assert.equal((await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })).status, 204, path);

    const given = await prisma.therapy.create({ data: { name: `${TAG} Abhyanga`, duration_minutes: 60 } });
    const unused = await prisma.therapy.create({ data: { name: `${TAG} Unused`, duration_minutes: 60 } });
    const asha = await prisma.staff.create({ data: { name: `${TAG} Asha`, gender: 'female', specializations: [], weekly_schedule: {} } });
    const room = await prisma.therapyRoom.create({ data: { name: `${TAG} Room`, weekly_schedule: {} } });
    const rekha = await prisma.patient.create({ data: { name: `${TAG} Rekha`, gender: 'female' } });
    const book = (day: string) => prisma.appointment.create({ data: {
      patient_id: rekha.id, therapy_id: given.id, staff_id: asha.id, room_id: room.id, scheduled_date: new Date(`${day}T00:00:00.000Z`),
      start_time: '10:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual',
    } });
    const [done] = [await book(PAST), await book(AHEAD)];
    const left = async () => (await prisma.appointment.findMany({ where: { patient_id: rekha.id } })).map((a) => a.id);

    await del(`/staff/${asha.id}`);
    assert.deepEqual(await left(), [done.id], 'the done treatment stays with the therapist deleted; the coming one goes');

    await book(AHEAD);
    await del(`/rooms/${room.id}`);
    assert.deepEqual(await left(), [done.id], 'the same for a room');

    await book(AHEAD);
    await del(`/therapies/${given.id}`);
    assert.deepEqual(await left(), [done.id], 'the same for a therapy');
    assert.equal((await prisma.therapy.findUniqueOrThrow({ where: { id: given.id } })).is_active, false, 'a therapy that was given is kept, out of use');
    const listed = (await (await fetch(`${API_BASE}/therapies`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { id: string }[];
    assert.ok(!listed.some((t) => t.id === given.id), 'and is no longer offered');

    await del(`/therapies/${unused.id}`);
    assert.equal(await prisma.therapy.findUnique({ where: { id: unused.id } }), null, 'a therapy never given is deleted');
    console.log('PASS deleteKeepsDone');
  } finally {
    await tidy(prisma);
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
