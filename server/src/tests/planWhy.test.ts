/**
 * What waits in a plan is explained once and can go to its next free day (#987).
 * A pair-only therapy, one of its two therapists off: the plan names why, and
 * the row carries the next day both are in. Its own small centre in 2030.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { planRange } from '../dayCheck.js';
import { requireDemoData } from './demoGuard.js';

const allDay = Object.fromEntries(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]));
const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function main() {
  const prisma = new PrismaClient();
  const made: [string, string][] = [];
  try {
    await requireDemoData(prisma);
    const therapy = await prisma.therapy.create({ data: { name: 'Why Pair Abhyanga', required_amenities: [], duration_minutes: 60, staff_required: 2, requires_gender_match: true } });
    made.push(['therapy', therapy.id]);
    const room = await prisma.therapyRoom.create({ data: { name: 'Why Room', amenities: [], is_active: true, weekly_schedule: allDay } });
    made.push(['therapyRoom', room.id]);
    const [a, b] = await Promise.all(['Why Asha', 'Why Bina'].map((name) => prisma.staff.create({ data: { name, gender: 'female', is_active: true, specializations: [therapy.id], weekly_schedule: allDay } })));
    made.push(['staff', a.id], ['staff', b.id]);
    const patient = await prisma.patient.create({ data: { name: 'Why Guest', gender: 'female' } });
    made.push(['patient', patient.id]);
    const stay = await prisma.patientStay.create({ data: { patient_id: patient.id, start_date: at('2030-04-01'), end_date: at('2030-04-10'), duration_days: 10 } });
    made.push(['patientStay', stay.id]);
    const appt = await prisma.appointment.create({ data: { patient_id: patient.id, therapy_id: therapy.id, staff_id: a.id, co_staff_ids: [b.id], room_id: room.id, scheduled_date: at('2030-04-03'), start_time: '10:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual' } });
    made.push(['appointment', appt.id]);
    const off = await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: b.id, date: at('2030-04-03'), description: 'Did not come' } });
    made.push(['timeOff', off.id]);

    const plan = await planRange('2030-04-03', '2030-04-03', prisma, { now: { date: '2030-04-03', time: '08:00' } });
    const mine = plan.waiting.find((w) => w.appointment_id === appt.id);
    assert.ok(mine, 'it waits for the admin');
    assert.match(plan.why ?? '', /Why Pair Abhyanga needs two trained therapists of the guest's gender/, plan.why ?? 'no why');
    assert.equal(mine!.later?.date, '2030-04-04', 'its next free day is offered');
    console.log('PASS planWhy');
  } finally {
    for (const [table, id] of made.reverse()) await (prisma as unknown as Record<string, { delete: (q: object) => Promise<unknown> }>)[table].delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
