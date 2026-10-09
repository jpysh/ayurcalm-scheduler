/**
 * A room taken out of use for days moves what is booked in it (#659), and
 * undoing the replan puts every treatment back in that room. Until then only a
 * therapist's leave replanned; the room's treatments stayed and printed as normal.
 *
 * It builds its own small centre on two days in 2030 and tidies up after itself.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { replanRoomDay, undoReplan } from '../replan.js';
import { requireDemoData } from './demoGuard.js';

const allDay = Object.fromEntries(
  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]),
);

async function main() {
  const prisma = new PrismaClient();
  const made: { table: string; id: string }[] = [];
  try {
    await prisma.$connect();
    await requireDemoData(prisma);
    const days = [new Date('2030-03-09T00:00:00.000Z'), new Date('2030-03-10T00:00:00.000Z')];
    const now = { date: '2030-03-08', time: '17:00' };

    const therapy = await prisma.therapy.create({ data: { name: 'Out Abhyanga', required_amenities: [], duration_minutes: 60, requires_gender_match: false } });
    made.push({ table: 'therapy', id: therapy.id });
    const [shut, open] = [await prisma.therapyRoom.create({ data: { name: 'Out Shut', amenities: [], is_active: true, weekly_schedule: allDay } }), await prisma.therapyRoom.create({ data: { name: 'Out Open', amenities: [], is_active: true, weekly_schedule: allDay } })];
    made.push({ table: 'therapyRoom', id: shut.id }, { table: 'therapyRoom', id: open.id });
    const staff = await prisma.staff.create({ data: { name: 'Out Asha', gender: 'other', is_active: true, specializations: [therapy.id], weekly_schedule: allDay } });
    made.push({ table: 'staff', id: staff.id });
    const patient = await prisma.patient.create({ data: { name: 'Out P1', gender: 'other' } });
    made.push({ table: 'patient', id: patient.id });
    const appts = [];
    for (const d of days) {
      const a = await prisma.appointment.create({ data: { patient_id: patient.id, therapy_id: therapy.id, staff_id: staff.id, room_id: shut.id, scheduled_date: d, start_time: '10:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual' } });
      made.push({ table: 'appointment', id: a.id });
      appts.push(a);
    }
    const off = await prisma.timeOff.create({ data: { entity_type: 'room', entity_id: shut.id, start_date: days[0], end_date: days[1], date: days[0], description: 'Repainting' } });
    made.push({ table: 'timeOff', id: off.id });

    const batches = [];
    for (const d of days) {
      const r = await replanRoomDay(off, d, prisma, { now });
      assert.equal(r.moved.length, 1, `one treatment moved on ${d.toISOString().slice(0, 10)}`);
      batches.push(r.batch_id!);
    }
    for (const a of appts) {
      const after = await prisma.appointment.findUniqueOrThrow({ where: { id: a.id } });
      assert.notEqual(after.room_id, shut.id, 'out of the room that is out of use');
    }
    for (const b of batches) await undoReplan(b, prisma);
    for (const a of appts) {
      const back = await prisma.appointment.findUniqueOrThrow({ where: { id: a.id } });
      assert.equal(back.room_id, shut.id, 'Undo puts it back');
      assert.equal(back.start_time, '10:00');
    }
    await prisma.auditLog.deleteMany({ where: { id: { in: batches } } });
    console.log('roomOut: ok');
  } finally {
    for (const m of [...made].reverse()) {
      try {
        if (m.table === 'appointment') await prisma.appointment.delete({ where: { id: m.id } });
        if (m.table === 'timeOff') await prisma.timeOff.delete({ where: { id: m.id } });
        if (m.table === 'patient') await prisma.patient.delete({ where: { id: m.id } });
        if (m.table === 'staff') await prisma.staff.delete({ where: { id: m.id } });
        if (m.table === 'therapyRoom') await prisma.therapyRoom.delete({ where: { id: m.id } });
        if (m.table === 'therapy') await prisma.therapy.delete({ where: { id: m.id } });
      } catch { /* already gone */ }
    }
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
