import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

/**
 * A double-booked therapist is not a crash — it is a sheet that sends two
 * patients to one room and is only found out on the day. These invariants hold
 * over every booked day in the database, so the seed and anything scheduled on
 * top of it are both covered.
 *
 * Needs a seeded database: DATABASE_URL must point at one.
 */

const prisma = new PrismaClient();
const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const overlaps = (aS: number, aE: number, bS: number, bE: number) => Math.max(aS, bS) < Math.min(aE, bE);

const main = async () => {
  const [appts, therapies, rooms, patients, staff] = await Promise.all([
    prisma.appointment.findMany(),
    prisma.therapy.findMany(),
    prisma.therapyRoom.findMany(),
    prisma.patient.findMany(),
    prisma.staff.findMany(),
  ]);
  const therapyById = new Map(therapies.map((t) => [t.id, t]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const patientById = new Map(patients.map((p) => [p.id, p]));
  const staffById = new Map(staff.map((s) => [s.id, s]));

  const byDay = new Map<string, typeof appts>();
  for (const a of appts) {
    const key = a.scheduled_date.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) || []), a]);
  }

  // A therapy's buffer blocks the room, the therapist and the patient, so
  // "busy" means the treatment plus its rest and cleanup.
  const span = (a: (typeof appts)[number]) => {
    const s = toMinutes(a.start_time);
    return { s, e: s + a.duration_minutes + (therapyById.get(a.therapy_id)?.buffer_minutes ?? 0) };
  };
  const noDoubleBooking = (key: (a: (typeof appts)[number]) => string | null, what: string) => {
    for (const [day, list] of byDay) {
      const seen = new Map<string, { s: number; e: number; id: string }[]>();
      for (const a of list) {
        const k = key(a);
        if (!k) continue;
        const { s, e } = span(a);
        const prior = seen.get(k) || [];
        const clash = prior.find((b) => overlaps(b.s, b.e, s, e));
        assert.equal(clash, undefined, `${what} ${k} double-booked on ${day}: ${a.id} overlaps ${clash?.id}`);
        seen.set(k, [...prior, { s, e, id: a.id }]);
      }
    }
  };

  const cases: [string, () => void][] = [
    ['no therapist is in two places at once', () => noDoubleBooking((a) => a.staff_id, 'therapist')],
    ['no room holds two treatments at once', () => noDoubleBooking((a) => a.room_id, 'room')],
    ['no patient has two treatments at once', () => noDoubleBooking((a) => a.patient_id, 'patient')],

    ['every room has the amenities its therapy needs', () => {
      for (const a of appts) {
        const th = therapyById.get(a.therapy_id);
        const room = a.room_id ? roomById.get(a.room_id) : null;
        if (!th || !room) continue;
        for (const need of th.required_amenities) {
          assert.ok(room.amenities.includes(need), `${th.name} in ${room.name} needs ${need}`);
        }
      }
    }],

    ['a therapy that requires a gender match has one', () => {
      for (const a of appts) {
        const th = therapyById.get(a.therapy_id);
        if (!th?.requires_gender_match || !a.staff_id) continue;
        const p = patientById.get(a.patient_id);
        const s = staffById.get(a.staff_id);
        assert.equal(s?.gender, p?.gender, `${th.name} for ${p?.name} assigned to ${s?.name}`);
      }
    }],

    ['every treatment is inside its room’s opening hours', () => {
      const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
      for (const a of appts) {
        const room = a.room_id ? roomById.get(a.room_id) : null;
        const day = (room?.weekly_schedule as Record<string, { start: string; end: string }> | null)?.[weekdays[a.scheduled_date.getUTCDay()]];
        if (!day) continue;
        const s = toMinutes(a.start_time);
        // The buffer may run past closing: the rest is the patient's, not the
        // room's next booking. Only the treatment itself must fit.
        assert.ok(s >= toMinutes(day.start) && s + a.duration_minutes <= toMinutes(day.end),
          `${a.start_time} +${a.duration_minutes}m outside ${day.start}-${day.end} in ${room?.name}`);
      }
    }],

    ['the sheet has enough patients to be worth printing', () => {
      const today = new Date().toISOString().slice(0, 10);
      const distinct = new Set((byDay.get(today) || []).map((a) => a.patient_id));
      assert.ok(distinct.size >= 30, `only ${distinct.size} patients booked today`);
    }],
  ];

  let failed = 0;
  for (const [name, run] of cases) {
    try {
      run();
      console.log(`ok   ${name}`);
    } catch (err) {
      failed++;
      console.error(`FAIL ${name}`);
      console.error(`     ${err instanceof Error ? err.message.split('\n')[0] : err}`);
    }
  }
  console.log(`\n${cases.length - failed}/${cases.length} passed over ${appts.length} appointments on ${byDay.size} days`);
  process.exit(failed === 0 ? 0 : 1);
};

main().finally(() => prisma.$disconnect());
