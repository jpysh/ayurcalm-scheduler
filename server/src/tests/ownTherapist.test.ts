/**
 * #135: a resident who is only treated by their own therapist, when that
 * therapist is off.
 *
 *   - off for one day and free the next: the plan moves the treatment to them
 *     the next day, at a time the resident and a room are free too.
 *   - off for nine days: the row is a question with three choices, and
 *     "another therapist this time only" is the one selected.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { checkDay } from '../dayCheck.js';
import { requireDemoData } from './demoGuard.js';

const TAG = 'Owntest';
const allDay = Object.fromEntries(
  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '07:00', end: '21:00' }]),
);
const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function tidy(prisma: PrismaClient) {
  const staff = await prisma.staff.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  await prisma.timeOff.deleteMany({ where: { entity_id: { in: staff.map((s) => s.id) } } });
  const patients = await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  await prisma.appointment.deleteMany({ where: { patient_id: { in: patients.map((p) => p.id) } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: patients.map((p) => p.id) } } });
  await prisma.patient.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.staff.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapy.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await requireDemoData(prisma);
    await tidy(prisma);
    const therapy = await prisma.therapy.create({ data: { name: `${TAG} Sweda`, required_amenities: [], duration_minutes: 60 } });
    const x = await prisma.staff.create({ data: { name: `${TAG} X`, gender: 'female', specializations: [therapy.id], weekly_schedule: allDay } });
    const y = await prisma.staff.create({ data: { name: `${TAG} Y`, gender: 'female', specializations: [therapy.id], weekly_schedule: allDay } });
    const book = (patient_id: string, staff_id: string, day: string, start_time: string) => prisma.appointment.create({
      data: {
        patient_id, therapy_id: therapy.id, staff_id, scheduled_date: at(day), start_time, duration_minutes: 60,
        session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual',
      },
    });
    const resident = (name: string) => prisma.patient.create({
      data: { name: `${TAG} ${name}`, gender: 'male', preferred_staff_id: x.id, requires_preferred_staff: true,
        Stays: { create: { start_date: at('2030-03-01'), end_date: at('2030-03-31'), duration_days: 31 } } },
    });

    // Off one day, free the next.
    {
      const p = await resident('Aarav');
      const appt = await book(p.id, x.id, '2030-03-11', '14:00');
      // Tomorrow at 14:00 the resident is already with Y: the move must not land on it.
      await book(p.id, y.id, '2030-03-12', '14:00');
      await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: x.id, date: at('2030-03-11'), description: 'Leave' } });
      const check = await checkDay(at('2030-03-11'), prisma);
      const fix = check.plan.find((f) => f.appointment_id === appt.id);
      assert.ok(fix, 'No plan for a resident whose own therapist is free tomorrow');
      assert.equal(fix.staff_id, x.id, 'Moved to someone other than their own therapist');
      assert.equal(fix.date, '2030-03-12');
      assert.notEqual(fix.start_time, '14:00', 'Moved on top of the resident\'s own 14:00');
      assert.ok(fix.room_id, 'No room');
      assert.match(fix.label, /their own therapist/);
    }

    // Off nine days: ask, with "another therapist this time only" selected.
    {
      await prisma.timeOff.deleteMany({ where: { entity_id: x.id } });
      const p = await resident('Bela');
      const appt = await book(p.id, x.id, '2030-03-18', '10:00');
      await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: x.id, start_date: at('2030-03-18'), end_date: at('2030-03-26'), description: 'Leave' } });
      const check = await checkDay(at('2030-03-18'), prisma);
      const problem = check.problems.find((q) => q.appointment_id === appt.id && q.problem_class === 'blocking');
      assert.ok(problem?.fix, 'No selected answer');
      assert.equal(problem.fix.choice, 'this_time_only');
      assert.equal(problem.fix.staff_id, y.id);
      assert.deepEqual(problem.choices.map((c) => c.choice), ['this_time_only', 'next_free_day', 'cancel']);
      const next = problem.choices.find((c) => c.choice === 'next_free_day')!;
      assert.equal(next.staff_id, x.id);
      assert.equal(next.date, '2030-03-27');
    }
    console.log('Own therapist: back tomorrow moves to them; away 9 days asks, with another therapist this time selected.');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
