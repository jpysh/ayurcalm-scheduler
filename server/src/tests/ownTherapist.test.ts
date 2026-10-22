/**
 * #1043: a resident's own therapist is the first choice everywhere, never a lock.
 *
 *   - free: the booking sheet offers them first, and a course is all theirs.
 *   - away for a day of a course: that day goes to someone else, and the
 *     course says how many days each therapist has.
 *   - away on the day: the plan keeps the time with another therapist, selected,
 *     and offers a later day with their own.
 *   - gender match still refuses: an own therapist of the wrong gender is never offered.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { checkDay } from '../dayCheck.js';
import { bookingOptions } from '../cardChoices.js';
import { autoSchedule } from '../scheduler.js';
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
    const resident = (name: string, own = x.id) => prisma.patient.create({
      data: { name: `${TAG} ${name}`, gender: 'male', preferred_staff_id: own,
        Stays: { create: { start_date: at('2030-03-01'), end_date: at('2030-03-31'), duration_days: 31 } } },
    });
    const course = (patient_id: string, therapy_id: string, start_date: string, total_sessions: number) => autoSchedule({
      patient_id, therapy_id, total_sessions, start_date, end_date: '2030-03-31', preferred_time_range: { start: '09:00', end: '12:00' }, now: '2030-01-01T00:00:00.000Z',
    }, prisma) as Promise<{ success: boolean; by_therapist: { staff_id: string; count: number }[] }>;

    // Free: offered first, and a course is all theirs.
    {
      const p = await resident('Chirag', y.id);
      const o = await bookingOptions('2030-03-05', null, { patient_id: p.id, therapy_id: therapy.id }, undefined, prisma);
      assert.equal(o?.first_choice?.staff_id, y.id, 'The booking sheet did not open on their own therapist');
      assert.ok(o?.first_choice?.their_therapist);
      assert.ok(o!.times.every((t) => t.staff_id === y.id), 'Times listed for someone other than the therapist picked');
      assert.equal(o?.sooner, null, 'Offered someone sooner when their own is free first thing');
      const c = await course(p.id, therapy.id, '2030-03-04', 3);
      assert.ok(c.success);
      assert.deepEqual(c.by_therapist.map((b) => [b.staff_id, b.count]), [[y.id, 3]]);
    }

    // Away one day of a course: that day goes to someone else, and the course counts it.
    {
      const p = await resident('Dev', y.id);
      await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: y.id, date: at('2030-03-08'), description: 'Leave' } });
      const c = await course(p.id, therapy.id, '2030-03-07', 3);
      assert.ok(c.success, 'The course failed with their own therapist away one day');
      assert.deepEqual(c.by_therapist.map((b) => [b.staff_id, b.count]), [[y.id, 2], [x.id, 1]]);
      // On the day they are away the sheet says when they are next free, and who is free sooner.
      const o = await bookingOptions('2030-03-08', null, { patient_id: p.id, therapy_id: therapy.id }, undefined, prisma);
      assert.equal(o?.first_choice?.staff_id, y.id);
      assert.equal(o?.first_choice?.date, '2030-03-09');
      assert.equal(o?.sooner?.staff_id, x.id, 'No sooner line with the therapist who is in');
      await prisma.timeOff.deleteMany({ where: { entity_id: y.id } });
    }

    // Away on the day: the time kept with another, selected; later with their own offered.
    {
      const p = await resident('Aarav');
      const appt = await book(p.id, x.id, '2030-03-11', '14:00');
      // Tomorrow at 14:00 the resident is already with Y: the later day must not land on it.
      await book(p.id, y.id, '2030-03-12', '14:00');
      await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: x.id, date: at('2030-03-11'), description: 'Leave' } });
      const check = await checkDay(at('2030-03-11'), prisma);
      const problem = check.problems.find((q) => q.appointment_id === appt.id && q.problem_class === 'blocking');
      assert.ok(problem?.fix, 'No selected answer');
      assert.equal(problem.fix.choice, 'this_time_only');
      assert.equal(problem.fix.staff_id, y.id, 'The time was not kept with the therapist who is in');
      assert.equal(problem.fix.start_time, '14:00');
      assert.deepEqual(problem.choices.map((c) => c.choice), ['this_time_only', 'next_free_day', 'cancel']);
      const later = problem.choices.find((c) => c.choice === 'next_free_day')!;
      assert.equal(later.staff_id, x.id, 'The later choice is not with their own therapist');
      assert.equal(later.date, '2030-03-12');
      assert.notEqual(later.start_time, '14:00', 'Moved on top of the resident\'s own 14:00');
      assert.match(later.label, /with Owntest X \(their therapist, 1 day later\)/);
    }

    // Gender match still refuses: a woman of their own is never offered to a man.
    {
      const gendered = await prisma.therapy.create({ data: { name: `${TAG} Udvartana`, required_amenities: [], duration_minutes: 60, requires_gender_match: true } });
      const m = await prisma.staff.create({ data: { name: `${TAG} M`, gender: 'male', specializations: [gendered.id], weekly_schedule: allDay } });
      await prisma.staff.update({ where: { id: x.id }, data: { specializations: [therapy.id, gendered.id] } });
      const p = await resident('Eshan');
      const o = await bookingOptions('2030-03-20', null, { patient_id: p.id, therapy_id: gendered.id }, undefined, prisma);
      assert.ok(o!.times.length > 0);
      assert.ok(o!.times.every((t) => t.staff_id === m.id), 'Their own therapist of the other gender was offered');
      assert.equal(o?.first_choice ?? null, null);
      const c = await course(p.id, gendered.id, '2030-03-20', 2);
      assert.deepEqual(c.by_therapist.map((b) => b.staff_id), [m.id]);
    }
    console.log('Own therapist: offered first and given the course when free; a day away goes to another and is counted; on leave the time is kept with another and later with their own offered; gender match still refuses.');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
