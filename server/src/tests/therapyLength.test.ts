/**
 * A therapy's new length asks about the treatments already booked (#1079): the
 * save is refused with the count until the admin says change or keep, a done
 * treatment never changes, and Undo with the same answer puts the old length back.
 *
 * A fixed past day and a fixed day in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Lentest';

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
    const put = (id: string, body: object) => fetch(`${API_BASE}/therapies/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

    const vasti = await prisma.therapy.create({ data: { name: `${TAG} Vasti`, duration_minutes: 45 } });
    const asha = await prisma.staff.create({ data: { name: `${TAG} Asha`, gender: 'female', specializations: [], weekly_schedule: {} } });
    const room = await prisma.therapyRoom.create({ data: { name: `${TAG} Room`, weekly_schedule: {} } });
    const rekha = await prisma.patient.create({ data: { name: `${TAG} Rekha`, gender: 'female' } });
    const book = (day: string, status: 'confirmed' | 'completed') => prisma.appointment.create({ data: {
      patient_id: rekha.id, therapy_id: vasti.id, staff_id: asha.id, room_id: room.id, scheduled_date: new Date(`${day}T00:00:00.000Z`),
      start_time: '10:00', duration_minutes: 45, session_number: 1, total_sessions: 1, status, assignment_type: 'manual',
    } });
    const done = await book('2020-08-14', 'completed');
    const ahead = [await book('2030-08-14', 'confirmed'), await book('2030-08-15', 'confirmed')];
    const mins = async (id: string) => (await prisma.appointment.findUniqueOrThrow({ where: { id } })).duration_minutes;

    const asked = await put(vasti.id, { duration_minutes: 90 });
    assert.equal(asked.status, 409, 'a new length with treatments booked asks first');
    assert.equal((await asked.json()).count, 2, 'and says how many are booked');
    assert.equal((await prisma.therapy.findUniqueOrThrow({ where: { id: vasti.id } })).duration_minutes, 45, 'nothing is saved before the answer');

    assert.equal((await put(vasti.id, { duration_minutes: 90, booked: 'keep' })).status, 200);
    assert.deepEqual([await mins(ahead[0].id), await mins(ahead[1].id)], [45, 45], 'only new bookings: the booked ones keep their length');
    assert.equal((await put(vasti.id, { duration_minutes: 45, booked: 'keep' })).status, 200);

    assert.equal((await put(vasti.id, { duration_minutes: 90, booked: 'change' })).status, 200);
    assert.deepEqual([await mins(ahead[0].id), await mins(ahead[1].id)], [90, 90], 'also change the booked: they take the new length');
    assert.equal(await mins(done.id), 45, 'a treatment already given keeps the length it had');

    assert.equal((await put(vasti.id, { duration_minutes: 45, booked: 'change' })).status, 200);
    assert.deepEqual([await mins(ahead[0].id), await mins(ahead[1].id)], [45, 45], 'Undo puts the booked ones back');
    assert.equal((await put(vasti.id, { name: `${TAG} Vasti` })).status, 200, 'an edit that leaves the length alone does not ask');
    console.log('PASS therapyLength');
  } finally {
    await tidy(prisma);
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
