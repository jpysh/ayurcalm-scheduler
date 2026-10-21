/**
 * Closing the centre with treatments booked (#933).
 *
 * The treatments on a closed day move to the next open day in one pass, never
 * onto another closed day and never on top of each other; the day check reads in
 * words, not "closed for Closed"; and deleting the closure (Undo) puts every
 * treatment back where it was.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { checkDay } from '../dayCheck.js';
import { moveOffClosedDays } from '../replan.js';
import { requireDemoData } from './demoGuard.js';

const allDay = Object.fromEntries(
  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]),
);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const prisma = new PrismaClient();
  const made: { table: string; id: string }[] = [];
  try {
    await prisma.$connect();
    await requireDemoData(prisma);

    const shut = new Date('2030-01-16T00:00:00.000Z'); // Wednesday
    const alsoShut = new Date('2030-01-17T00:00:00.000Z'); // the next day is a holiday too
    const therapy = await prisma.therapy.create({ data: { name: 'Close Therapy', required_amenities: ['table'], duration_minutes: 60, requires_gender_match: false } });
    made.push({ table: 'therapy', id: therapy.id });
    const room = await prisma.therapyRoom.create({ data: { name: 'Close Room', amenities: ['table'], is_active: true, weekly_schedule: allDay } });
    made.push({ table: 'therapyRoom', id: room.id });
    const therapist = await prisma.staff.create({ data: { name: 'Close One', gender: 'other', is_active: true, specializations: [therapy.id], weekly_schedule: allDay } });
    made.push({ table: 'staff', id: therapist.id });

    const appts = [];
    for (const [i, start] of ['09:00', '10:00', '11:00'].entries()) {
      const p = await prisma.patient.create({ data: { name: `Close P${i}`, gender: 'other' } });
      made.push({ table: 'patient', id: p.id });
      const a = await prisma.appointment.create({ data: {
        patient_id: p.id, therapy_id: therapy.id, staff_id: therapist.id, room_id: room.id, scheduled_date: shut, start_time: start,
        duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual',
      } });
      made.push({ table: 'appointment', id: a.id });
      appts.push(a);
    }

    // Closed with no reason: the day check says so in words and counts the treatments once.
    const closure = await prisma.timeOff.create({ data: { entity_type: 'center', date: shut, start_date: shut, end_date: shut, description: '' } });
    made.push({ table: 'timeOff', id: closure.id });
    const holiday = await prisma.timeOff.create({ data: { entity_type: 'center', date: alsoShut, start_date: alsoShut, end_date: alsoShut, description: 'Close Holiday' } });
    made.push({ table: 'timeOff', id: holiday.id });

    const before = await checkDay(shut, prisma, { now: { date: '2030-01-15', time: '17:00' } });
    assert.ok(before.headline && !/closed for Closed/i.test(before.headline), `headline: ${before.headline}`);
    assert.match(before.headline, /3 treatments are booked on it/, `the headline should count the treatments: ${before.headline}`);
    assert.equal(before.groups.filter((g) => g.key === 'CENTER_HOLIDAY').length, 1, 'one heading for the whole closed day');
    assert.ok(!before.problems.some((p) => p.kind === 'IDLE_RESIDENT'), 'nothing booked on a closed day is not a failure');

    // The Day screen is told it is closed, by what name, which row to edit, and what is still booked (#940).
    assert.deepEqual(before.closed, { name: null, time_off_id: closure.id, booked: 3, movable: 3 });

    // The plan never offers a closed day: not the same day (a no-op), not Thursday.
    const moved = await moveOffClosedDays('2030-01-16', '2030-01-16', prisma, { timeOffId: closure.id, now: { date: '2030-01-15', time: '17:00' } });
    assert.equal(moved.moved, 3, `all three should move, got ${JSON.stringify(moved)}`);
    assert.equal(moved.left, 0);
    assert.equal(moved.first, '2030-01-18', 'the next OPEN day: Thursday is a holiday too');

    const after = await prisma.appointment.findMany({ where: { id: { in: appts.map((a) => a.id) } } });
    assert.ok(after.every((a) => ymd(a.scheduled_date) === '2030-01-18'), 'every treatment is on Friday');
    const hours = after.map((a) => a.start_time);
    assert.equal(new Set(hours).size, 3, `three moves must not share an hour (same therapist and room): ${hours}`);

    // Undo is deleting the closure's own batch: every treatment returns exactly.
    const batches = await prisma.auditLog.findMany({ where: { action: 'dayfix' } });
    const mine = batches.filter((b) => (b.old_value as { time_off_id?: string } | null)?.time_off_id === closure.id);
    assert.equal(mine.length, 1, 'one batch, one Undo');
    const { undoReplan } = await import('../replan.js');
    await undoReplan(mine[0].id, prisma);
    const back = await prisma.appointment.findMany({ where: { id: { in: appts.map((a) => a.id) } }, orderBy: { start_time: 'asc' } });
    assert.deepEqual(back.map((a) => [ymd(a.scheduled_date), a.start_time]), [['2030-01-16', '09:00'], ['2030-01-16', '10:00'], ['2030-01-16', '11:00']]);
    await prisma.auditLog.deleteMany({ where: { id: { in: mine.map((b) => b.id) } } });

    // Leaving that day, none can go to a later day of the stay: the day check says so, and Move would move none (#1048).
    for (const a of appts) {
      const st = await prisma.patientStay.create({ data: { patient_id: a.patient_id, start_date: new Date('2030-01-14T00:00:00.000Z'), end_date: shut, duration_days: 3 } });
      made.push({ table: 'patientStay', id: st.id });
    }
    const leaving = await checkDay(shut, prisma, { now: { date: '2030-01-15', time: '17:00' } });
    assert.equal(leaving.closed?.movable, 0, `none can move on their leaving day, got ${JSON.stringify(leaving.closed)}`);
    assert.equal((await moveOffClosedDays('2030-01-16', '2030-01-16', prisma, { now: { date: '2030-01-15', time: '17:00' } })).moved, 0, 'the day check and Move disagree');

    console.log('closeDay: ok');
  } finally {
    for (const m of [...made].reverse()) {
      try {
        if (m.table === 'patientStay') await prisma.patientStay.delete({ where: { id: m.id } });
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
