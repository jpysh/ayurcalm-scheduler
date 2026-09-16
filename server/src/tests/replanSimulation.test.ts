/**
 * The replan, run against a real day and checked.
 *
 * The rules are easy to state and easy to get subtly wrong — a swap that
 * double-books the substitute, a resident moved on top of their own next
 * treatment, a resident who may only be treated by one person handed to someone
 * else. So this builds a small centre of its own, marks a therapist off, and
 * asserts what came out. It tidies up after itself and refuses to run against
 * a centre's own database.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { replanStaffDay, undoReplan } from '../replan.js';
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

    const day = new Date(new Date().toISOString().slice(0, 10));
    const therapy = await prisma.therapy.create({ data: { name: 'Sim Therapy', required_amenities: ['table'], duration_minutes: 60, buffer_minutes: 0, requires_gender_match: false } });
    made.push({ table: 'therapy', id: therapy.id });

    const rooms = [];
    for (const name of ['Sim Room A', 'Sim Room B']) {
      rooms.push(await prisma.therapyRoom.create({ data: { name, amenities: ['table'], is_active: true, weekly_schedule: allDay } }));
    }
    rooms.forEach((r) => made.push({ table: 'therapyRoom', id: r.id }));

    const staff = [];
    for (const name of ['Sim Absent', 'Sim Cover One', 'Sim Cover Two', 'Sim Loyal']) {
      staff.push(await prisma.staff.create({ data: { name, gender: 'other', is_active: true, specializations: [therapy.id], weekly_schedule: allDay } }));
    }
    staff.forEach((s) => made.push({ table: 'staff', id: s.id }));
    const [absent, coverOne, coverTwo, loyalTherapist] = staff;

    const patients = [];
    for (const name of ['Sim Resident One', 'Sim Resident Two', 'Sim Resident Loyal']) {
      patients.push(await prisma.patient.create({ data: { name, gender: 'other' } }));
    }
    patients.forEach((p) => made.push({ table: 'patient', id: p.id }));
    const [pOne, pTwo, pLoyal] = patients;

    // One resident is only treated by Sim Loyal, who is not the absent one:
    // their treatment must keep those hands and move in time instead.
    await prisma.patient.update({ where: { id: pLoyal.id }, data: { preferred_staff_id: loyalTherapist.id, requires_preferred_staff: true } });

    const book = async (patientId: string, staffId: string, roomId: string, start: string) => {
      const a = await prisma.appointment.create({ data: {
        patient_id: patientId, therapy_id: therapy.id, staff_id: staffId, room_id: roomId,
        scheduled_date: day, start_time: start, duration_minutes: 60, session_number: 1, total_sessions: 1,
        status: 'confirmed', assignment_type: 'manual', notes: '',
      } });
      made.push({ table: 'appointment', id: a.id });
      return a;
    };

    // The absent therapist's day: three treatments.
    await book(pOne.id, absent.id, rooms[0].id, '10:00');
    await book(pTwo.id, absent.id, rooms[0].id, '11:00');
    await book(pLoyal.id, absent.id, rooms[1].id, '12:00');
    // Sim Loyal is busy at noon, so the loyal resident cannot simply stay put.
    await book(pOne.id, loyalTherapist.id, rooms[1].id, '15:00');

    // Sim Cover Two runs a class over 10:00, so only Sim Cover One can take the
    // first treatment at its own time.
    const ev = await prisma.programEvent.create({ data: {
      recurrence: 'weekly', weekdays: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      start_time: '10:00', end_time: '11:00', activity_name: 'Sim Yoga', required_amenities: [],
      staff_scope: 'custom', staff_ids: [coverTwo.id], staff_id: coverTwo.id, is_optional: true,
    } });
    made.push({ table: 'programEvent', id: ev.id });

    const result = await replanStaffDay(absent.id, day, prisma, { apply: true });

    // Nothing is left on the absent therapist.
    const after = await prisma.appointment.findMany({ where: { scheduled_date: day, staff_id: absent.id } });
    assert.equal(after.length, 0, 'the absent therapist still has treatments');

    // The two ordinary residents kept their time — a swap, not a move.
    const tier1 = result.moved.filter((m) => m.tier === 1);
    assert.ok(tier1.length >= 2, `expected two same-time swaps, got ${tier1.length}`);
    assert.ok(tier1.every((m) => m.to.start_time === m.from.start_time));

    // The one who was at 10:00 could not go to the therapist running the class.
    const ten = result.moved.find((m) => m.from.start_time === '10:00');
    assert.ok(ten && ten.to.staff_id !== coverTwo.id, 'gave a treatment to a therapist who is running a class');

    // The loyal resident kept their therapist and changed time instead.
    const loyalMove = [...result.moved, ...result.proposed].find((m) => m.patient_name === 'Sim Resident Loyal');
    assert.ok(loyalMove, 'the loyal resident was not dealt with at all');
    assert.equal(loyalMove!.to.staff_id, loyalTherapist.id, 'the loyal resident was handed to someone else');
    assert.notEqual(loyalMove!.to.start_time, '12:00');

    // Nobody is in two places: no therapist, room or resident is double-booked.
    const dayNow = await prisma.appointment.findMany({ where: { scheduled_date: day, status: { not: 'cancelled' } } });
    const clash = (key: 'staff_id' | 'room_id' | 'patient_id') => {
      for (const a of dayNow) {
        for (const b of dayNow) {
          if (a.id === b.id || !a[key] || a[key] !== b[key]) continue;
          if (overlaps(toMinutes(a.start_time), toMinutes(a.start_time) + a.duration_minutes, toMinutes(b.start_time), toMinutes(b.start_time) + b.duration_minutes)) {
            return `${key} double-booked at ${a.start_time}`;
          }
        }
      }
      return null;
    };
    for (const key of ['staff_id', 'room_id', 'patient_id'] as const) assert.equal(clash(key), null);

    // Nobody was booked across the class they are running.
    const overClass = dayNow.find((a) => a.staff_id === coverTwo.id && overlaps(toMinutes(a.start_time), toMinutes(a.start_time) + a.duration_minutes, 600, 660));
    assert.equal(overClass, undefined, 'booked a therapist across their own class');

    // Undo puts the day back exactly as it was.
    assert.ok(result.batch_id);
    await undoReplan(result.batch_id!, prisma);
    const restored = await prisma.appointment.findMany({ where: { scheduled_date: day, staff_id: absent.id } });
    assert.equal(restored.length, 3, 'undo did not put the absent therapist back on their three treatments');
    assert.deepEqual(restored.map((a) => a.start_time).sort(), ['10:00', '11:00', '12:00']);

    console.log('replan simulation passed');
  } finally {
    for (const m of [...made].reverse()) {
      try {
        await (prisma as unknown as Record<string, { delete: (a: unknown) => Promise<unknown> }>)[m.table].delete({ where: { id: m.id } });
      } catch { /* already gone */ }
    }
    await prisma.auditLog.deleteMany({ where: { action: { in: ['replan', 'replan_undone'] }, entity_id: { in: made.filter((m) => m.table === 'staff').map((m) => m.id) } } });
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
