/**
 * The endpoint and the booking path agree.
 *
 * This is the whole point of the one rulebook: what `GET /day-check` calls a
 * clash must be what a write refuses, and what it leaves alone must be what a
 * write accepts. Before this existed, Verify reported a clean day while
 * `PUT /appointments` refused four of that day's treatments.
 *
 * So: build a small centre, put four deliberately wrong treatments on one day —
 * a therapist on leave, a double-booked room, a therapist of the wrong gender
 * for a therapy that requires a match, and a room without the equipment — then
 * check every appointment both ways and assert the two answers are the same
 * appointment for appointment. It tidies up after itself and refuses to run
 * against a centre's own database.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { checkDay, headlineFor } from '../dayCheck.js';
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

    const day = new Date(new Date().toISOString().slice(0, 10));

    const plain = await prisma.therapy.create({ data: { name: 'Parity Plain', required_amenities: ['table'], duration_minutes: 60, requires_gender_match: false } });
    const gendered = await prisma.therapy.create({ data: { name: 'Parity Gendered', required_amenities: ['table'], duration_minutes: 60, requires_gender_match: true } });
    const needsDroni = await prisma.therapy.create({ data: { name: 'Parity Droni', required_amenities: ['droni'], duration_minutes: 60, requires_gender_match: false } });
    [plain, gendered, needsDroni].forEach((t) => made.push({ table: 'therapy', id: t.id }));

    const roomA = await prisma.therapyRoom.create({ data: { name: 'Parity Room A', amenities: ['table', 'droni'], is_active: true, weekly_schedule: allDay } });
    const roomB = await prisma.therapyRoom.create({ data: { name: 'Parity Room B', amenities: ['table'], is_active: true, weekly_schedule: allDay } });
    [roomA, roomB].forEach((r) => made.push({ table: 'therapyRoom', id: r.id }));

    const away = await prisma.staff.create({ data: { name: 'Parity Away', gender: 'female', is_active: true, specializations: [plain.id, gendered.id, needsDroni.id], weekly_schedule: allDay } });
    const here = await prisma.staff.create({ data: { name: 'Parity Here', gender: 'female', is_active: true, specializations: [plain.id, gendered.id, needsDroni.id], weekly_schedule: allDay } });
    const man = await prisma.staff.create({ data: { name: 'Parity Man', gender: 'male', is_active: true, specializations: [gendered.id], weekly_schedule: allDay } });
    [away, here, man].forEach((s) => made.push({ table: 'staff', id: s.id }));

    const one = await prisma.patient.create({ data: { name: 'Parity One', gender: 'female' } });
    const two = await prisma.patient.create({ data: { name: 'Parity Two', gender: 'female' } });
    const three = await prisma.patient.create({ data: { name: 'Parity Three', gender: 'female' } });
    const four = await prisma.patient.create({ data: { name: 'Parity Four', gender: 'female' } });
    const five = await prisma.patient.create({ data: { name: 'Parity Five', gender: 'female' } });
    [one, two, three, four, five].forEach((p) => made.push({ table: 'patient', id: p.id }));

    const book = async (patientId: string, therapyId: string, staffId: string, roomId: string, start: string) => {
      const a = await prisma.appointment.create({
        data: {
          patient_id: patientId, therapy_id: therapyId, staff_id: staffId, room_id: roomId,
          scheduled_date: day, start_time: start, duration_minutes: 60,
          session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual',
        },
      });
      made.push({ table: 'appointment', id: a.id });
      return a;
    };

    // Wrong on purpose, one of each: the therapist is not in, the room is taken,
    // the therapist is the wrong gender for a therapy that requires a match, and
    // the room has no droni. Plus one that is perfectly fine.
    const onLeave = await book(one.id, plain.id, away.id, roomA.id, '09:00');
    const roomTakenFirst = await book(two.id, plain.id, here.id, roomB.id, '11:00');
    const roomTakenSecond = await book(three.id, plain.id, man.id, roomB.id, '11:30');
    const wrongGender = await book(four.id, gendered.id, man.id, roomA.id, '14:00');
    const noDroni = await book(five.id, needsDroni.id, here.id, roomB.id, '15:30');
    const fine = await book(one.id, plain.id, here.id, roomA.id, '16:30');

    const leave = await prisma.timeOff.create({
      data: { entity_type: 'staff', entity_id: away.id, date: day, description: 'Parity leave', weekdays: [] },
    });
    made.push({ table: 'timeOff', id: leave.id });

    // What the endpoint says.
    const check = await checkDay(day, prisma);
    const blockingById = new Map(
      check.problems.filter((p) => p.problem_class === 'blocking' && p.appointment_id).map((p) => [p.appointment_id as string, p]),
    );

    // What a write would say, asked exactly as `PUT /appointments/:id` asks it.
    const ctx = await loadDay(day, prisma);
    const appointments = await prisma.appointment.findMany({ where: { scheduled_date: day, status: { not: 'cancelled' } } });
    for (const a of appointments) {
      const conflict = findConflict(
        {
          id: a.id, scheduled_date: a.scheduled_date, start_time: a.start_time,
          duration_minutes: a.duration_minutes, staff_id: a.staff_id, room_id: a.room_id,
          patient_id: a.patient_id, therapy_id: a.therapy_id,
        },
        ctx,
      );
      const reported = blockingById.get(a.id);
      if (conflict) {
        assert.ok(reported, `the write refuses ${a.id} (${conflict.reason}) and day-check does not mention it`);
        assert.equal(reported.kind, conflict.reason, `day-check and the write disagree about why ${a.id} is wrong`);
        assert.equal(reported.what, conflict.message, 'the admin should read the same sentence either way');
      } else {
        assert.ok(!reported, `day-check calls ${a.id} a clash and the write accepts it`);
      }
    }

    // And the four planted problems are all found, by the name the guard gives them.
    assert.equal(blockingById.get(onLeave.id)?.kind, 'STAFF_OFF');
    assert.equal(blockingById.get(wrongGender.id)?.kind, 'GENDER_MISMATCH');
    assert.equal(blockingById.get(noDroni.id)?.kind, 'AMENITIES_MISSING');
    assert.ok(
      blockingById.get(roomTakenFirst.id)?.kind === 'ROOM_BUSY' || blockingById.get(roomTakenSecond.id)?.kind === 'ROOM_BUSY',
      'the double-booked room should be reported',
    );
    assert.ok(!blockingById.has(fine.id), 'a treatment nothing is wrong with should not be reported');

    // A fix that is offered must be one the write would accept: the card's
    // button cannot hand the admin a refusal.
    for (const p of check.problems) {
      if (!p.fix || p.fix.date !== check.date) continue;
      const appt = appointments.find((a) => a.id === p.fix?.appointment_id);
      if (!appt) continue;
      const after = await loadDay(day, prisma);
      const conflict = findConflict(
        {
          id: appt.id, scheduled_date: day, start_time: p.fix.start_time,
          duration_minutes: appt.duration_minutes, staff_id: p.fix.staff_id, room_id: p.fix.room_id,
          patient_id: appt.patient_id, therapy_id: appt.therapy_id,
        },
        after,
      );
      assert.ok(!conflict, `the fix offered for ${p.who} would be refused: ${conflict?.message}`);
    }

    // The header's line names the worst problem and the residents in it, rather
    // than counting them. (Written over this test's own problems: a seeded day
    // has problems of its own and either could sort first.)
    const mine = check.problems.filter((p) => p.patient_name.startsWith('Parity '));
    const line = headlineFor(mine);
    assert.ok(line && line.includes('Parity One'), `headline should name the resident: ${line}`);
    assert.ok(line && /and \d+ more to fix$/.test(line), `headline should count the rest: ${line}`);

    console.log('dayCheck parity: ok');
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
