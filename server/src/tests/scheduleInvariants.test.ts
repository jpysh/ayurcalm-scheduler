import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { staffEventBusy } from '../availability.js';

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
  const [appts, therapies, rooms, patients, staff, events] = await Promise.all([
    prisma.appointment.findMany(),
    prisma.therapy.findMany(),
    prisma.therapyRoom.findMany(),
    prisma.patient.findMany(),
    prisma.staff.findMany(),
    prisma.programEvent.findMany(),
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
    return { s, e: s + a.duration_minutes };
  };
  // A key can be several people: everyone on a treatment worked by two.
  const noDoubleBooking = (key: (a: (typeof appts)[number]) => string | null | (string | null)[], what: string) => {
    for (const [day, list] of byDay) {
      const seen = new Map<string, { s: number; e: number; id: string }[]>();
      for (const a of list) for (const k of [key(a)].flat()) {
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
    ['no therapist is in two places at once, leading or assisting', () => noDoubleBooking((a) => [a.staff_id, ...a.co_staff_ids], 'therapist')],
    ['a treatment worked by two has two therapists', () => {
      let pairs = 0;
      for (const a of appts) {
        const th = therapyById.get(a.therapy_id);
        const team = new Set([a.staff_id, ...a.co_staff_ids].filter(Boolean));
        if (!th || !a.staff_id) continue;
        assert.equal(team.size, th.staff_required, `${th.name} ${a.id} has ${team.size} therapists, needs ${th.staff_required}`);
        if (th.staff_required > 1) pairs++;
      }
      // The demo shows the case, or nobody at :8080 can see it.
      assert.ok(pairs > 0, 'the demo books no treatment worked by two');
    }],
    ['no therapist is treating someone while running an event', () => {
      for (const a of appts) {
        if (a.status === 'cancelled') continue;
        const { s, e } = span(a);
        for (const id of [a.staff_id, ...a.co_staff_ids]) {
          if (!id) continue;
          const clash = staffEventBusy(events, id, a.scheduled_date).find((b) => overlaps(b.s, b.e, s, e));
          assert.equal(clash, undefined, `therapist ${id} runs ${clash?.label} during ${a.id} on ${a.scheduled_date.toISOString().slice(0, 10)}`);
        }
      }
    }],
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
        for (const id of [a.staff_id, ...a.co_staff_ids]) {
          const s = staffById.get(id);
          assert.equal(s?.gender, p?.gender, `${th.name} for ${p?.name} assigned to ${s?.name}`);
        }
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
      // The centre's day, as the seed builds it and the app reads it. Using the
      // server's UTC day found an empty schedule whenever the two disagreed.
      const tz = process.env.ADMIN_TZ || 'Asia/Kolkata';
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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
