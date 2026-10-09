/**
 * A therapy or a patient marked off for some days (#670) is refused by the guard,
 * raised by the day check, and never offered back by the planner. Until then only
 * the auto-booker read these rows, so a treatment added by hand slipped through.
 *
 * It builds its own small centre on a day in 2030 and tidies up after itself.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { checkDay } from '../dayCheck.js';
import { findConflict, loadDay } from '../appointmentGuard.js';
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
    const day = new Date('2030-02-20T00:00:00.000Z');
    const before = { date: '2030-02-19', time: '17:00' };

    const therapy = await prisma.therapy.create({ data: { name: 'Off Shirodhara', required_amenities: [], duration_minutes: 60, requires_gender_match: false } });
    made.push({ table: 'therapy', id: therapy.id });
    const room = await prisma.therapyRoom.create({ data: { name: 'Off Room', amenities: [], is_active: true, weekly_schedule: allDay } });
    made.push({ table: 'therapyRoom', id: room.id });
    const staff = await prisma.staff.create({ data: { name: 'Off Asha', gender: 'other', is_active: true, specializations: [therapy.id], weekly_schedule: allDay } });
    made.push({ table: 'staff', id: staff.id });
    const [p1, p2] = [await prisma.patient.create({ data: { name: 'Off P1', gender: 'other' } }), await prisma.patient.create({ data: { name: 'Off P2', gender: 'other' } })];
    made.push({ table: 'patient', id: p1.id }, { table: 'patient', id: p2.id });

    const off = async (data: Record<string, unknown>) => {
      const t = await prisma.timeOff.create({ data: { start_date: day, end_date: day, ...data } as never });
      made.push({ table: 'timeOff', id: t.id });
    };
    await off({ entity_type: 'therapy', entity_id: therapy.id, description: 'Oil ran out' });
    await off({ entity_type: 'patient', entity_id: p2.id, start_time: '09:00', end_time: '13:00', description: 'Day trip' });

    const at = (patient_id: string, start_time: string) => ({ scheduled_date: day, start_time, duration_minutes: 60, staff_id: staff.id, room_id: room.id, patient_id, therapy_id: therapy.id });

    const ctx = await loadDay(day, prisma);
    const t = findConflict(at(p1.id, '10:00'), ctx);
    assert.equal(t?.reason, 'THERAPY_OFF', 'a therapy off for the day is refused');
    assert.equal(t?.message, 'Off Shirodhara is not given on this day (Oil ran out).');

    // The patient's part day: refused in those hours, free after (with the therapy back on).
    await prisma.timeOff.deleteMany({ where: { entity_type: 'therapy', entity_id: therapy.id } });
    const ctx2 = await loadDay(day, prisma);
    assert.equal(findConflict(at(p2.id, '10:00'), ctx2)?.message, 'Off P2 has no treatments from 09:00 to 13:00 (Day trip).');
    assert.equal(findConflict(at(p2.id, '14:00'), ctx2), null, 'free once the trip is over');

    // Booked by hand into the trip: the day check raises it and the plan moves it out of those hours.
    const a = await prisma.appointment.create({ data: { ...at(p2.id, '10:00'), session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual' } });
    made.push({ table: 'appointment', id: a.id });
    const check = await checkDay(day, prisma, { now: before });
    const problem = check.problems.find((p) => p.appointment_id === a.id);
    assert.equal(problem?.kind, 'PATIENT_OFF', 'the day check raises it');
    assert.equal(problem?.problem_class, 'blocking');
    const fix = problem?.fix;
    assert.ok(fix, 'the planner offers somewhere else');
    assert.ok(fix!.date !== '2030-02-20' || fix!.start_time >= '13:00', `not inside the trip: ${fix!.date} ${fix!.start_time}`);

    // A therapy off all day: the planner offers no time that day at all.
    await off({ entity_type: 'therapy', entity_id: therapy.id, description: 'Oil ran out' });
    const later = (await checkDay(day, prisma, { now: before })).problems.find((p) => p.appointment_id === a.id);
    assert.equal(later?.kind, 'THERAPY_OFF');
    for (const f of [later?.fix, ...(later?.choices ?? [])].filter(Boolean)) {
      assert.notEqual(f!.date, '2030-02-20', 'never the same day');
    }
    console.log('offDays: ok');
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
