/**
 * The Log (#130): a change made in the app is its newest line, in words; a
 * fix from the day's check can be undone from it, and once undone it says so
 * and offers no Undo.
 *
 * Its own day in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Logtest';
const DAY = '2030-08-14';
const allWeek = Object.fromEntries(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]));

async function tidy(prisma: PrismaClient) {
  const patients = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  const appts = (await prisma.appointment.findMany({ where: { patient_id: { in: patients } }, select: { id: true } })).map((a) => a.id);
  // A day-check batch is filed under its first treatment, so this takes those too.
  await prisma.auditLog.deleteMany({ where: { entity_id: { in: appts } } });
  await prisma.appointment.deleteMany({ where: { id: { in: appts } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: patients } } });
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
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
      assert.ok(res.ok, `${method} ${path}: ${res.status} ${await res.clone().text()}`);
      return res.json();
    };
    const log = async () => (await call('GET', '/log')).entries as { id: string; text: string; undo: string | null; undone: boolean }[];

    const therapy = await prisma.therapy.create({ data: { name: `${TAG} Abhyanga`, duration_minutes: 60 } });
    const asha = await prisma.staff.create({ data: { name: `${TAG} Asha`, gender: 'female', specializations: [therapy.id], weekly_schedule: allWeek } });
    const [roomA, roomB] = await Promise.all(['A', 'B'].map((n) => prisma.therapyRoom.create({ data: { name: `${TAG} Room ${n}`, weekly_schedule: allWeek } })));
    const rekha = await prisma.patient.create({ data: { name: `${TAG} Rekha`, gender: 'female' } });
    await prisma.patientStay.create({ data: { patient_id: rekha.id, start_date: new Date(`${DAY}T00:00:00.000Z`), end_date: new Date(`${DAY}T00:00:00.000Z`), duration_days: 1 } });
    const appt = await prisma.appointment.create({ data: {
      patient_id: rekha.id, therapy_id: therapy.id, staff_id: asha.id, room_id: roomA.id, scheduled_date: new Date(`${DAY}T00:00:00.000Z`),
      start_time: '10:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual',
    } });

    await call('PUT', `/appointments/${appt.id}`, { start_time: '11:00' });
    let top = (await log())[0];
    assert.equal(top.text, `${rekha.name}'s ${therapy.name}: Start time changed from 10:00 to 11:00`);
    assert.equal(top.undo, null, 'an edit has its own Undo on the card, not here');

    const { batch_id } = await call('POST', '/day-check/accept', { date: DAY, moves: [{ appointment_id: appt.id, staff_id: asha.id, co_staff_ids: [], room_id: roomB.id, start_time: '11:00', date: DAY }] });
    top = (await log())[0];
    assert.equal(top.text, `${rekha.name}'s ${therapy.name}: Room changed from ${roomA.name} to ${roomB.name} (the day's check)`);
    assert.equal(top.undo, batch_id, 'the newest batch can be undone from the Log');

    await call('POST', '/replan/undo', { batch_id: top.undo });
    const after = (await log()).find((e) => e.id === batch_id)!;
    assert.ok(after.undone && after.text.endsWith('(undone)') && after.undo === null, `once undone: ${JSON.stringify(after)}`);
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).room_id, roomA.id);

    console.log("Log: an edit is the newest line in words, the day check's fix can be undone from it, and then says (undone).");
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
