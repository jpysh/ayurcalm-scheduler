/**
 * The plan is one plan.
 *
 * Verify used to ask "what would fix this?" once per problem, and the answers
 * did not know about each other: two treatments clashing over one room were both
 * told to move to 12:00, and whichever the admin tapped second was refused. The
 * day is now planned in one pass, so this checks the properties that makes true:
 *
 *   - no two moves in a plan overlap on a therapist, a room or a resident
 *   - a move never leaves a treatment exactly where it already is
 *   - a row the admin pinned survives the replan, and the rest fits around it
 *   - accepting writes every move as one batch, and Undo puts the day back
 *   - a room cannot be double-booked through the API in the first place
 *
 * It builds its own small centre, tidies up after itself, and refuses to run
 * against a centre's own database.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { checkDay, rowOptions } from '../dayCheck.js';
import { applyPlan, undoReplan } from '../replan.js';
import { findConflict, loadDay } from '../appointmentGuard.js';
import { requireDemoData } from './demoGuard.js';

const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const overlaps = (aS: number, aE: number, bS: number, bE: number) => Math.max(aS, bS) < Math.min(aE, bE);
const allDay = Object.fromEntries(
  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]),
);

async function main() {
  const prisma = new PrismaClient();
  const made: { table: string; id: string }[] = [];
  try {
    await prisma.$connect();
    await requireDemoData(prisma);

    // A day of its own, so the seeded centre's day is neither read nor touched.
    const day = new Date('2030-01-16T00:00:00.000Z');

    const therapy = await prisma.therapy.create({ data: { name: 'Plan Therapy', required_amenities: ['table'], duration_minutes: 60, requires_gender_match: false } });
    made.push({ table: 'therapy', id: therapy.id });

    const rooms = [];
    for (const name of ['Plan Room A', 'Plan Room B']) {
      rooms.push(await prisma.therapyRoom.create({ data: { name, amenities: ['table'], is_active: true, weekly_schedule: allDay } }));
    }
    rooms.forEach((r) => made.push({ table: 'therapyRoom', id: r.id }));
    const [roomA] = rooms;

    const staff = [];
    for (const name of ['Plan Away', 'Plan One', 'Plan Two', 'Plan Three']) {
      staff.push(await prisma.staff.create({ data: { name, gender: 'other', is_active: true, specializations: [therapy.id], weekly_schedule: allDay } }));
    }
    staff.forEach((s) => made.push({ table: 'staff', id: s.id }));
    const [away, coverOne] = staff;

    const patients = [];
    for (const name of ['Plan P1', 'Plan P2', 'Plan P3']) {
      patients.push(await prisma.patient.create({ data: { name, gender: 'other' } }));
    }
    patients.forEach((p) => made.push({ table: 'patient', id: p.id }));

    const book = async (patientId: string, staffId: string | null, roomId: string, start: string) => {
      const a = await prisma.appointment.create({
        data: {
          patient_id: patientId, therapy_id: therapy.id, staff_id: staffId, room_id: roomId,
          scheduled_date: day, start_time: start, duration_minutes: 60,
          session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual',
        },
      });
      made.push({ table: 'appointment', id: a.id });
      return a;
    };

    // Three treatments on one absent therapist, close enough together that the
    // answers have to negotiate for the same hands and the same rooms.
    const first = await book(patients[0].id, away.id, roomA.id, '09:00');
    const second = await book(patients[1].id, away.id, roomA.id, '10:00');
    const third = await book(patients[2].id, away.id, roomA.id, '11:00');
    const leave = await prisma.timeOff.create({
      data: { entity_type: 'staff', entity_id: away.id, date: day, description: 'Plan leave', weekdays: [] },
    });
    made.push({ table: 'timeOff', id: leave.id });

    // --- the plan does not collide with itself ---
    const check = await checkDay(day, prisma);
    const planned = check.plan.filter((f) => f.date === check.date);
    assert.ok(planned.length >= 3, `expected the three treatments to be planned, got ${planned.length}`);

    const byAppointment = new Map(check.problems.filter((p) => p.appointment_id).map((p) => [p.appointment_id as string, p]));
    for (let i = 0; i < planned.length; i++) {
      for (let j = i + 1; j < planned.length; j++) {
        const a = planned[i];
        const b = planned[j];
        const aS = toMinutes(a.start_time);
        const bS = toMinutes(b.start_time);
        if (!overlaps(aS, aS + 60, bS, bS + 60)) continue;
        assert.notEqual(a.staff_id, b.staff_id, `two moves give ${a.staff_name} the same hour`);
        assert.notEqual(a.room_id, b.room_id, 'two moves put treatments in one room at one time');
        const pa = byAppointment.get(a.appointment_id);
        const pb = byAppointment.get(b.appointment_id);
        assert.notEqual(pa?.patient_id, pb?.patient_id, 'two moves put one resident in two places');
      }
    }

    // --- a move always moves something ---
    const current = await prisma.appointment.findMany({ where: { scheduled_date: day } });
    for (const f of check.plan) {
      const appt = current.find((a) => a.id === f.appointment_id);
      if (!appt || f.date !== check.date) continue;
      assert.ok(
        f.staff_id !== appt.staff_id || f.start_time !== appt.start_time || f.room_id !== appt.room_id,
        `the plan offers ${f.label}, which changes nothing`,
      );
    }

    // --- a pinned row survives, and the rest fits around it ---
    const options = await rowOptions(second.id, day, prisma);
    assert.ok(options.length > 0, 'a treatment with cover available should offer alternatives');
    const chosen = options[options.length - 1];
    const pin = {
      appointment_id: second.id,
      staff_id: chosen.staff_id,
      room_id: chosen.room_id,
      start_time: chosen.start_time,
      date: chosen.date,
    };
    const repinned = await checkDay(day, prisma, { pins: [pin] });
    const pinnedRow = repinned.plan.find((f) => f.appointment_id === second.id);
    assert.ok(pinnedRow, 'the pinned row should still be in the plan');
    assert.equal(pinnedRow.staff_id, pin.staff_id, "the admin's own choice was overwritten");
    assert.equal(pinnedRow.start_time, pin.start_time, "the admin's own choice was moved");
    assert.ok(pinnedRow.pinned, 'the pinned row should be marked as the admin\'s');
    for (const f of repinned.plan.filter((x) => x.appointment_id !== second.id && x.date === repinned.date)) {
      const fS = toMinutes(f.start_time);
      const pS = toMinutes(pinnedRow.start_time);
      if (!overlaps(fS, fS + 60, pS, pS + 60)) continue;
      assert.notEqual(f.staff_id, pinnedRow.staff_id, 'the plan booked the pinned therapist twice');
      assert.notEqual(f.room_id, pinnedRow.room_id, 'the plan booked the pinned room twice');
    }

    // --- accepting writes the lot, and Undo puts it back ---
    const before = new Map(current.map((a) => [a.id, { staff_id: a.staff_id, start_time: a.start_time, room_id: a.room_id }]));
    const moves = repinned.plan.map((f) => ({
      appointment_id: f.appointment_id, staff_id: f.staff_id, room_id: f.room_id, start_time: f.start_time, date: f.date,
    }));
    const applied = await applyPlan(moves, prisma);
    assert.equal(applied.applied, moves.length, 'every move in the plan should be written');

    const after = await loadDay(day, prisma);
    for (const a of after.appointments) {
      if (!before.has(a.id)) continue;
      const conflict = findConflict({
        id: a.id, scheduled_date: a.scheduled_date, start_time: a.start_time, duration_minutes: a.duration_minutes,
        staff_id: a.staff_id, room_id: a.room_id, patient_id: a.patient_id, therapy_id: a.therapy_id,
      }, after);
      assert.ok(!conflict, `the accepted plan left a problem behind: ${conflict?.message}`);
    }

    await undoReplan(applied.batch_id, prisma);
    const restored = await prisma.appointment.findMany({ where: { scheduled_date: day } });
    for (const a of restored) {
      const was = before.get(a.id);
      if (!was) continue;
      assert.equal(a.staff_id, was.staff_id, 'Undo did not put the therapist back');
      assert.equal(a.start_time, was.start_time, 'Undo did not put the time back');
      assert.equal(a.room_id, was.room_id, 'Undo did not put the room back');
    }

    // --- a room cannot be double-booked through the API ---
    // The scheduler never creates one; this is the other route, an edit.
    const ctx = await loadDay(day, prisma);
    const clash = findConflict({
      id: third.id, scheduled_date: day, start_time: first.start_time, duration_minutes: 60,
      staff_id: coverOne.id, room_id: roomA.id, patient_id: patients[2].id, therapy_id: therapy.id,
    }, ctx);
    assert.equal(clash?.reason, 'ROOM_BUSY', 'an edit into an occupied room must be refused');

    console.log('dayPlan: ok');
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
