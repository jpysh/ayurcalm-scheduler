/**
 * A guest who never arrives (#980): "Did not arrive" removes the stay, its room,
 * its meals and its booked treatments; Undo puts every one of them back.
 * Refused once a treatment in the stay was given.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Noarrivetest';
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

async function tidy(prisma: PrismaClient) {
  const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.dietPlanSegment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.dietPlan.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
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
    const call = (path: string, body?: unknown) => fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });

    const [therapy, staff, room, guestRoom, plan] = await Promise.all([
      prisma.therapy.findFirstOrThrow({ where: { is_consultation: false } }),
      prisma.staff.findFirstOrThrow({ where: { is_active: true } }),
      prisma.therapyRoom.findFirstOrThrow(),
      prisma.guestRoom.findFirstOrThrow(),
      prisma.dietTemplate.findFirstOrThrow(),
    ]);
    const p = await prisma.patient.create({ data: { name: `${TAG} Guest`, gender: 'female' } });
    const stay = await prisma.patientStay.create({ data: { patient_id: p.id, start_date: day('2030-04-02'), end_date: day('2030-04-15'), duration_days: 14, on_site: true, guest_room_id: guestRoom.id, accommodation_id: guestRoom.accommodation_id } });
    await prisma.dietPlanSegment.create({ data: { patient_id: p.id, start_date: day('2030-04-02'), end_date: day('2030-04-15'), template_id: plan.id } });
    await prisma.dietPlan.create({ data: { patient_id: p.id, date: day('2030-04-03'), meal_time: 'lunch', description: 'Rice gruel', created_by: 'test' } });
    const appt = { patient_id: p.id, therapy_id: therapy.id, staff_id: staff.id, room_id: room.id, start_time: '07:00', duration_minutes: therapy.duration_minutes, co_staff_ids: [], session_number: 1, total_sessions: 1, status: 'confirmed' as const, assignment_type: 'manual' as const };
    const a = await prisma.appointment.create({ data: { ...appt, scheduled_date: day('2030-04-03') } });

    const res = await call(`/patients/${p.id}/stays/${stay.id}/did-not-arrive`);
    assert.equal(res.status, 200, await res.clone().text());
    const out = await res.json();
    assert.equal(out.cancelled, 1, 'the booked treatment is cancelled');
    assert.equal(await prisma.patientStay.count({ where: { patient_id: p.id } }), 0, 'the stay, and with it the room and Form C, is gone');
    assert.equal(await prisma.dietPlanSegment.count({ where: { patient_id: p.id } }) + await prisma.dietPlan.count({ where: { patient_id: p.id } }), 0, 'the meals are gone');
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: a.id } })).cancel_reason, 'did not arrive');

    assert.equal((await call('/stays/did-not-arrive/undo', { undo_id: out.undo_id })).status, 200);
    const back = await prisma.patientStay.findUniqueOrThrow({ where: { id: stay.id } });
    assert.equal(back.guest_room_id, guestRoom.id, 'Undo gives the room back');
    assert.equal(await prisma.dietPlanSegment.count({ where: { patient_id: p.id } }), 1, 'Undo gives the plan back');
    assert.equal(await prisma.dietPlan.count({ where: { patient_id: p.id } }), 1, 'Undo gives the day meal back');
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: a.id } })).status, 'confirmed', 'Undo books the treatment again');

    await prisma.appointment.update({ where: { id: a.id }, data: { status: 'completed' } });
    assert.equal((await call(`/patients/${p.id}/stays/${stay.id}/did-not-arrive`)).status, 409, 'a guest who was treated did arrive');
    console.log('did not arrive: stay, room, meals and treatments go, and Undo brings them back');
  } finally {
    await tidy(prisma);
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
