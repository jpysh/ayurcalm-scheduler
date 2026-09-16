/**
 * What to do with a day's treatments when the therapist who was going to give
 * them is not coming in.
 *
 * The daily crisis in a residential centre is not a no-show, it is a therapist
 * not turning up. A resident's day is anchored to their meals, their other
 * treatments and the stage of their purification, so the order of preference is
 * not negotiable:
 *
 *   1. same time, same room, another pair of hands   — applied
 *   2. same day, another time                        — applied
 *   3. another day                                   — proposed, never applied
 *
 * Tiers 1 and 2 are recoveries. Moving a treatment to another day changes which
 * side of the diet plan the resident eats from and where they are in their
 * course, so it is put to the admin rather than done to them.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { overlaps, staffEventBusy, toMinutes, type EventRow } from './availability.js';

export type Move = {
  appointment_id: string;
  patient_name: string;
  therapy_name: string;
  tier: 1 | 2 | 3;
  from: { staff_name: string; start_time: string; date: string };
  to: { staff_id: string | null; staff_name: string; start_time: string; date: string; room_id: string | null };
};

export type Unplaced = {
  appointment_id: string;
  patient_name: string;
  therapy_name: string;
  start_time: string;
  reason: string;
};

export type ReplanResult = {
  batch_id: string | null;
  staff_name: string;
  date: string;
  moved: Move[];
  proposed: Move[];
  unplaced: Unplaced[];
};

const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const timeOffHitsDay = (
  h: { entity_type: string; entity_id: string | null; date: Date | null; start_date: Date | null; end_date: Date | null; recurrence: string | null; weekdays: string[] },
  day: Date,
) => {
  if (h.date && h.date.toDateString() === day.toDateString()) return true;
  if (h.start_date && h.end_date && h.start_date <= day && h.end_date >= day) return true;
  if (h.recurrence === 'weekly' && Array.isArray(h.weekdays) && h.weekdays.includes(WEEKDAYS[day.getDay()])) return true;
  return false;
};

type Busy = { s: number; e: number };
const free = (busy: Busy[] | undefined, s: number, e: number) => !(busy || []).some((b) => overlaps(b.s, b.e, s, e));

/**
 * Work out the plan, and apply tiers 1 and 2 unless asked only to look.
 *
 * `apply` writes the moves and one audit row for the batch, which is what Undo
 * reads to put the day back exactly as it was.
 */
export async function replanStaffDay(
  staffId: string,
  date: Date,
  prisma: PrismaClient,
  opts: { apply?: boolean; timeOffId?: string } = {},
): Promise<ReplanResult> {
  const [absent, settings, staff, therapies, rooms, patients, events, timeOff] = await Promise.all([
    prisma.staff.findUnique({ where: { id: staffId } }),
    prisma.settings.findUnique({ where: { id: 'singleton' } }),
    prisma.staff.findMany({ where: { is_active: true } }),
    prisma.therapy.findMany(),
    prisma.therapyRoom.findMany({ where: { is_active: true } }),
    prisma.patient.findMany(),
    prisma.programEvent.findMany() as unknown as Promise<EventRow[]>,
    prisma.timeOff.findMany(),
  ]);

  const open = toMinutes(settings?.opening_time || '09:00');
  const close = toMinutes(settings?.closing_time || '18:00');
  const enforceGender = settings?.enforce_gender_match !== false;
  const therapyById = new Map(therapies.map((t) => [t.id, t]));
  const patientById = new Map(patients.map((p) => [p.id, p]));
  const staffById = new Map(staff.map((s) => [s.id, s]));

  const dayAppointments = await prisma.appointment.findMany({
    where: { scheduled_date: date, status: { not: 'cancelled' } },
  });
  const mine = dayAppointments
    .filter((a) => a.staff_id === staffId)
    .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

  // Busy maps for the day, with the absent therapist's own bookings left out —
  // they are the ones being rehoused.
  const staffBusy: Record<string, Busy[]> = {};
  const roomBusy: Record<string, Busy[]> = {};
  const patientBusy: Record<string, Busy[]> = {};
  const addBusy = (map: Record<string, Busy[]>, key: string | null, s: number, e: number) => {
    if (!key) return;
    map[key] ??= [];
    map[key].push({ s, e });
  };
  for (const a of dayAppointments) {
    if (a.staff_id === staffId) continue;
    const s = toMinutes(a.start_time);
    const e = s + a.duration_minutes + (therapyById.get(a.therapy_id)?.buffer_minutes ?? 0);
    addBusy(staffBusy, a.staff_id, s, e);
    addBusy(roomBusy, a.room_id, s, e);
    addBusy(patientBusy, a.patient_id, s, e);
  }
  for (const s of staff) {
    for (const b of staffEventBusy(events, s.id, date)) addBusy(staffBusy, s.id, b.s, b.e);
    if (timeOff.some((h) => h.entity_type === 'staff' && h.entity_id === s.id && timeOffHitsDay(h, date))) {
      addBusy(staffBusy, s.id, 0, 24 * 60);
    }
  }
  for (const a of mine) {
    // The resident still owes this hour to the treatment being rehoused, so
    // their own slot is only busy for the others.
    const s = toMinutes(a.start_time);
    const e = s + a.duration_minutes;
    for (const other of mine) {
      if (other.id === a.id) continue;
      addBusy(patientBusy, other.patient_id, s, e);
    }
  }

  const moved: Move[] = [];
  const proposed: Move[] = [];
  const unplaced: Unplaced[] = [];
  const writes: { appointment_id: string; before: Record<string, unknown>; after: Record<string, unknown> }[] = [];

  for (const appt of mine) {
    const therapy = therapyById.get(appt.therapy_id);
    const patient = patientById.get(appt.patient_id);
    const duration = appt.duration_minutes + (therapy?.buffer_minutes ?? 0);
    const start = toMinutes(appt.start_time);
    const names = {
      patient_name: patient?.name || 'Unknown',
      therapy_name: therapy?.name || 'Treatment',
      from: { staff_name: absent?.name || 'Unknown', start_time: appt.start_time, date: ymd(date) },
    };

    const mustKeepTherapist = patient?.requires_preferred_staff ? patient.preferred_staff_id : null;

    const qualified = (s: (typeof staff)[number]) => {
      if (s.id === staffId) return false;
      if (!s.specializations.includes(appt.therapy_id)) return false;
      if (enforceGender && therapy?.requires_gender_match && patient && s.gender !== patient.gender) return false;
      return true;
    };
    // The resident's own therapist first when they have one; the least busy
    // otherwise, so a swap does not pile the day onto one person.
    const candidates = staff
      .filter(qualified)
      .sort((a, b) => {
        const pref = (s: string) => (patient?.preferred_staff_id === s ? -1 : 0);
        return pref(a.id) - pref(b.id) || (staffBusy[a.id]?.length || 0) - (staffBusy[b.id]?.length || 0);
      });

    const canTake = (sid: string, s: number, e: number) => free(staffBusy[sid], s, e);
    const roomFor = (s: number, e: number) => {
      if (appt.room_id && free(roomBusy[appt.room_id], s, e)) return appt.room_id;
      const alt = rooms.find(
        (r) => (therapy?.required_amenities || []).every((a) => r.amenities.includes(a)) && free(roomBusy[r.id], s, e),
      );
      return alt?.id ?? null;
    };

    const take = (sid: string | null, startMin: number, roomId: string | null, tier: 1 | 2) => {
      const end = startMin + duration;
      addBusy(staffBusy, sid, startMin, end);
      addBusy(roomBusy, roomId, startMin, end);
      addBusy(patientBusy, appt.patient_id, startMin, end);
      const move: Move = {
        appointment_id: appt.id,
        ...names,
        tier,
        to: {
          staff_id: sid,
          staff_name: sid ? staffById.get(sid)?.name || 'Unknown' : 'Unassigned',
          start_time: minutesToTime(startMin),
          date: ymd(date),
          room_id: roomId,
        },
      };
      moved.push(move);
      writes.push({
        appointment_id: appt.id,
        before: { staff_id: appt.staff_id, room_id: appt.room_id, start_time: appt.start_time, scheduled_date: appt.scheduled_date.toISOString() },
        after: { staff_id: sid, room_id: roomId, start_time: minutesToTime(startMin) },
      });
    };

    // Tier 1 — same time, same room, another therapist.
    if (!mustKeepTherapist) {
      const swap = candidates.find((s) => canTake(s.id, start, start + duration));
      if (swap && appt.room_id && free(roomBusy[appt.room_id], start, start + duration)) {
        take(swap.id, start, appt.room_id, 1);
        continue;
      }
      if (swap) {
        const room = roomFor(start, start + duration);
        if (room) {
          take(swap.id, start, room, 1);
          continue;
        }
      }
    }

    // Tier 2 — same day, another time. A resident who must have their own
    // therapist keeps them; everyone else takes the first therapist free.
    const tier2Candidates = mustKeepTherapist
      ? staff.filter((s) => s.id === mustKeepTherapist)
      : candidates;
    let placed = false;
    for (let t = open; t + duration <= close && !placed; t += 30) {
      if (!free(patientBusy[appt.patient_id], t, t + duration)) continue;
      const room = roomFor(t, t + duration);
      if (!room) continue;
      const who = tier2Candidates.find((s) => canTake(s.id, t, t + duration));
      if (!who) continue;
      take(who.id, t, room, 2);
      placed = true;
    }
    if (placed) continue;

    // Tier 3 — another day, same time, proposed only.
    let proposal: Move | null = null;
    for (let i = 1; i <= 7 && !proposal; i++) {
      const other = new Date(date);
      other.setDate(date.getDate() + i);
      if (patient?.available_to && other > patient.available_to) break;
      const otherDay = await prisma.appointment.findMany({ where: { scheduled_date: other, status: { not: 'cancelled' } } });
      const busyThen = (sid: string) =>
        otherDay.some((a) => a.staff_id === sid && overlaps(toMinutes(a.start_time), toMinutes(a.start_time) + a.duration_minutes, start, start + duration)) ||
        staffEventBusy(events, sid, other).some((b) => overlaps(b.s, b.e, start, start + duration)) ||
        timeOff.some((h) => h.entity_type === 'staff' && h.entity_id === sid && timeOffHitsDay(h, other));
      const who = tier2Candidates.find((s) => !busyThen(s.id));
      const roomFree = rooms.find(
        (r) =>
          (therapy?.required_amenities || []).every((a) => r.amenities.includes(a)) &&
          !otherDay.some((a) => a.room_id === r.id && overlaps(toMinutes(a.start_time), toMinutes(a.start_time) + a.duration_minutes, start, start + duration)),
      );
      if (who && roomFree) {
        proposal = {
          appointment_id: appt.id,
          ...names,
          tier: 3,
          to: { staff_id: who.id, staff_name: who.name, start_time: appt.start_time, date: ymd(other), room_id: roomFree.id },
        };
      }
    }
    if (proposal) {
      proposed.push(proposal);
      continue;
    }

    writes.push({
      appointment_id: appt.id,
      before: { staff_id: appt.staff_id, room_id: appt.room_id, start_time: appt.start_time, scheduled_date: appt.scheduled_date.toISOString() },
      // The name comes off: an absent therapist's name on a treatment reads as
      // covered, and the warning has to stay lit until someone deals with it.
      after: { staff_id: null, room_id: appt.room_id, start_time: appt.start_time },
    });
    unplaced.push({
      appointment_id: appt.id,
      patient_name: names.patient_name,
      therapy_name: names.therapy_name,
      start_time: appt.start_time,
      reason: mustKeepTherapist
        ? `${patientById.get(appt.patient_id)?.name || 'This resident'} is only treated by ${staffById.get(mustKeepTherapist)?.name || 'one therapist'}, who is not free this week.`
        : candidates.length === 0
          ? `No other therapist is trained in ${names.therapy_name}${enforceGender && therapy?.requires_gender_match ? ` and matches the resident's gender` : ''}.`
          : `Every therapist trained in ${names.therapy_name} is booked for the rest of the day.`,
    });
  }

  let batch_id: string | null = null;
  if (opts.apply && writes.length > 0) {
    for (const w of writes) {
      await prisma.appointment.update({
        where: { id: w.appointment_id },
        data: {
          staff_id: (w.after.staff_id as string | null) ?? null,
          room_id: (w.after.room_id as string | null) ?? null,
          start_time: w.after.start_time as string,
        },
      });
    }
    const row = await prisma.auditLog.create({
      data: {
        admin_id: 'admin',
        action: 'replan',
        entity_type: 'staff',
        entity_id: staffId,
        old_value: { writes, time_off_id: opts.timeOffId ?? null, date: ymd(date) } as unknown as Prisma.InputJsonValue,
        new_value: { moved, proposed, unplaced, staff_name: absent?.name || '' } as unknown as Prisma.InputJsonValue,
      },
    });
    batch_id = row.id;
  }

  return { batch_id, staff_name: absent?.name || 'Therapist', date: ymd(date), moved, proposed, unplaced };
}

/** Put a replan back exactly as it was. */
export async function undoReplan(batchId: string, prisma: PrismaClient) {
  const row = await prisma.auditLog.findUnique({ where: { id: batchId } });
  if (!row || row.action !== 'replan') return null;
  const payload = row.old_value as unknown as { writes: { appointment_id: string; before: Record<string, unknown> }[] };
  for (const w of payload.writes || []) {
    await prisma.appointment.update({
      where: { id: w.appointment_id },
      data: {
        staff_id: (w.before.staff_id as string | null) ?? null,
        room_id: (w.before.room_id as string | null) ?? null,
        start_time: w.before.start_time as string,
        scheduled_date: new Date(w.before.scheduled_date as string),
      },
    });
  }
  const summary = row.new_value as unknown as { staff_name?: string; moved?: Move[]; unplaced?: Unplaced[] };
  const restored = (summary.moved || []).length + (summary.unplaced || []).length;
  await prisma.auditLog.update({ where: { id: batchId }, data: { action: 'replan_undone' } });
  return { staff_name: summary.staff_name || 'The therapist', restored };
}
