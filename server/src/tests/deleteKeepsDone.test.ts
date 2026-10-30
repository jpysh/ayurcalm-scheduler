/**
 * Deleting a therapy takes only its treatments from today on (#567); a room with
 * treatments ahead is refused (#1304); a
 * therapist hands theirs to the others instead (#1080). Done ones stay on the
 * record, and a therapy that was given stays out of use so they keep its name.
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

    const res = await fetch(`${API_BASE}/staff/${asha.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    const handed = (await res.json()) as { moved: number; left: { patient_name: string }[] };
    const after = await prisma.appointment.findMany({ where: { patient_id: rekha.id }, orderBy: { scheduled_date: 'asc' } });
    assert.equal(after.length, 2, 'the coming treatment is kept, not deleted');
    assert.equal(after[0].staff_id, asha.id, 'the done one stays with the therapist deleted');
    assert.notEqual(after[1].staff_id, asha.id, 'the coming one is no longer on their name');
    assert.equal(handed.moved + handed.left.length, 1, 'and is either handed on or listed as left');
    if (after[1].staff_id === null) assert.equal(handed.left[0]?.patient_name, rekha.name, 'what nobody could take is listed');
    assert.equal((await prisma.staff.findUniqueOrThrow({ where: { id: asha.id } })).is_active, false);
    await prisma.appointment.delete({ where: { id: after[1].id } });

    const kept = await book(AHEAD);
    const refused = await fetch(`${API_BASE}/rooms/${room.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    assert.equal(refused.status, 409, 'a room with treatments ahead is not deleted (#1304)');
    assert.match(((await refused.json()) as { error: string }).error, /^1 treatment is booked in this room/);
    assert.deepEqual((await left()).sort(), [done.id, kept.id].sort(), 'and its coming treatment is kept');
    await prisma.appointment.delete({ where: { id: kept.id } });
    await del(`/rooms/${room.id}`);

    await book(AHEAD);
    await del(`/therapies/${given.id}`);
    assert.deepEqual(await left(), [done.id], 'the same for a therapy');
    assert.equal((await prisma.therapy.findUniqueOrThrow({ where: { id: given.id } })).is_active, false, 'a therapy that was given is kept, out of use');
    const listed = (await (await fetch(`${API_BASE}/therapies`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { id: string }[];
    assert.ok(!listed.some((t) => t.id === given.id), 'and is no longer offered');

    await del(`/therapies/${unused.id}`);
    assert.equal(await prisma.therapy.findUnique({ where: { id: unused.id } }), null, 'a therapy never given is deleted');

    // #1355: only a patient just added, with nothing on their record, can be taken away.
    const pdel = (pid: string) => fetch(`${API_BASE}/patients/${pid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await pdel(rekha.id)).status, 409, 'a patient with a done treatment is not erased');
    assert.ok(await prisma.patient.findUnique({ where: { id: rekha.id } }), 'and is still there');
    const old = await prisma.patient.create({ data: { name: `${TAG} Old`, gender: 'female', created_at: new Date(Date.now() - 3600_000) } });
    assert.equal((await pdel(old.id)).status, 409, 'nor one added an hour ago');
    const fresh = await prisma.patient.create({ data: { name: `${TAG} Fresh`, gender: 'female' } });
    assert.equal((await pdel(fresh.id)).status, 204, 'one just added can be undone');
    console.log('PASS deleteKeepsDone');
  } finally {
    await tidy(prisma);
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
