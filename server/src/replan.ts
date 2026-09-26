/**
 * One planner for a day's broken treatments, and the only place the order of
 * preference is written down.
 *
 * The daily crisis in a residential centre is not a no-show, it is a therapist
 * not turning up. A resident's day is anchored to their meals, their other
 * treatments and the stage of their purification, so the order of preference is
 * not negotiable:
 *
 *   1. same time, same room, another pair of hands   — applied
 *   2. same day, another time                        — applied
 *   3. a resident locked to the absent therapist: that therapist's first free
 *      slot in the next 3 days, inside the stay      — proposed, in the plan
 *   4. otherwise ask: up to three choices, the best one selected (#135) —
 *      another therapist this time only, the next day their own therapist is
 *      free, or cancel the treatment
 *
 * Tiers 1 and 2 are recoveries. Anything else changes which side of the diet
 * plan the resident eats from, where they are in their course, or who treats
 * them, so it is put to the admin: only their Accept applies it.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { centreClock, offOnDay, overlaps, startedBefore, staffEventBusy, teamOf, toMinutes, type Clock, type EventRow } from './availability.js';

/** Which of the tier 4 choices a move is. */
export type Choice = 'this_time_only' | 'next_free_day' | 'cancel';

export type Move = {
  appointment_id: string;
  patient_name: string;
  therapy_name: string;
  tier: 1 | 2 | 3;
  /** Set on a tier 4 answer: what kind of choice this is. */
  choice?: Choice;
  /** A few words after the label: "their own therapist", "9 days later". */
  note?: string;
  /** Cancel the treatment instead of moving it. Kept as cancelled; Undo restores it. */
  cancel?: boolean;
  /** Tier 4: every choice for this row, the selected one included. */
  choices?: Move[];
  from: { staff_name: string; start_time: string; date: string };
  /** `staff_id` leads; `co_staff_ids` is everyone else on the treatment. */
  to: { staff_id: string | null; co_staff_ids: string[]; staff_name: string; start_time: string; date: string; room_id: string | null };
  /** True when the admin chose this row themselves and the plan must keep it. */
  pinned?: boolean;
};

/** A row the admin has decided for themselves. The plan fits around it. */
export type Pin = {
  appointment_id: string;
  staff_id: string | null;
  co_staff_ids?: string[];
  start_time: string;
  date: string;
  room_id: string | null;
  cancel?: boolean;
};

export type Unplaced = {
  appointment_id: string;
  patient_name: string;
  therapy_name: string;
  start_time: string;
  reason: string;
  /** Tier 4 with nothing selected: what the admin can still pick. */
  choices?: Move[];
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
type Busy = { s: number; e: number };
const free = (busy: Busy[] | undefined, s: number, e: number) => !(busy || []).some((b) => overlaps(b.s, b.e, s, e));

/**
 * Plan a day.
 *
 * Every treatment that has to move is planned against one running picture of
 * the day, so two answers can never take the same room at the same minute. That
 * is the difference between this and asking the same question once per problem:
 * separately, two clashing treatments were both told to move to 12:00.
 *
 * `appointmentIds` says what is being rehoused — a therapist's whole day, or
 * whatever Verify found wrong. `pins` are the rows the admin has decided for
 * themselves: they are placed first and never moved, and everything else fits
 * around them.
 */
export async function planDay(
  staffId: string | null,
  date: Date,
  prisma: PrismaClient,
  opts: {
    apply?: boolean;
    timeOffId?: string;
    /** The treatments to rehouse. Defaults to everything on `staffId`. */
    appointmentIds?: string[];
    /** Rows the admin has already decided. */
    pins?: Pin[];
    /** Therapists already offered, so asking again gives a different answer. */
    excludeStaffIds?: string[];
    /** The one rule the admin may switch off, and nothing else. */
    relaxPreferredStaff?: boolean;
    /** The centre's clock. Defaults to now; tests pass a fixed one. */
    now?: Clock;
  } = {},
): Promise<ReplanResult> {
  const [absent, settings, staff, therapies, rooms, patients, events, timeOff] = await Promise.all([
    staffId ? prisma.staff.findUnique({ where: { id: staffId } }) : Promise.resolve(null),
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
  // What has started stays where it is: the plan never rewrites a treatment
  // that already happened, and never moves one to a time already gone.
  const cutoff = startedBefore(opts.now ?? centreClock(settings?.timezone || 'Asia/Kolkata'), date);
  const firstSlot = cutoff > open ? open + Math.ceil((cutoff - open) / 30) * 30 : open;
  const therapyById = new Map(therapies.map((t) => [t.id, t]));
  const patientById = new Map(patients.map((p) => [p.id, p]));
  const staffById = new Map(staff.map((s) => [s.id, s]));

  const dayAppointments = await prisma.appointment.findMany({
    where: { scheduled_date: date, status: { not: 'cancelled' } },
  });
  // The treatments being rehoused: a therapist's whole day, or the single
  // session Verify is fixing.
  const wanted = opts.appointmentIds ? new Set(opts.appointmentIds) : null;
  // A therapist out for some hours keeps the treatments outside them.
  const staffOff = staffId ? offOnDay(timeOff, 'staff', staffId, date) : [];
  const inWindow = (a: { start_time: string; duration_minutes: number }) =>
    staffOff.length === 0 || staffOff.some((b) => overlaps(b.s, b.e, toMinutes(a.start_time), toMinutes(a.start_time) + a.duration_minutes));
  const mine = dayAppointments
    .filter((a) => toMinutes(a.start_time) >= cutoff)
    .filter((a) => (wanted ? wanted.has(a.id) : Boolean(staffId) && teamOf(a).includes(staffId as string) && inWindow(a)))
    .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
  const mineIds = new Set(mine.map((a) => a.id));
  const pinnedBy = new Map((opts.pins || []).map((p) => [p.appointment_id, p]));

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
    if (mineIds.has(a.id)) continue;
    const s = toMinutes(a.start_time);
    const e = s + a.duration_minutes;
    for (const id of teamOf(a)) addBusy(staffBusy, id, s, e);
    addBusy(roomBusy, a.room_id, s, e);
    addBusy(patientBusy, a.patient_id, s, e);
  }
  for (const s of staff) {
    for (const b of staffEventBusy(events, s.id, date)) addBusy(staffBusy, s.id, b.s, b.e);
    for (const b of offOnDay(timeOff, 'staff', s.id, date)) addBusy(staffBusy, s.id, b.s, b.e);
  }
  for (const r of rooms) for (const b of offOnDay(timeOff, 'room', r.id, date)) addBusy(roomBusy, r.id, b.s, b.e);
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

  const teamName = (ids: (string | null)[]) =>
    ids.filter(Boolean).map((id) => staffById.get(id as string)?.name || 'Unknown').join(' and ') || 'Unassigned';
  const beforeOf = (a: (typeof dayAppointments)[number]) => ({
    status: a.status,
    staff_id: a.staff_id, co_staff_ids: a.co_staff_ids, room_id: a.room_id, start_time: a.start_time, scheduled_date: a.scheduled_date.toISOString(),
  });

  const moved: Move[] = [];
  const proposed: Move[] = [];
  // Later days, read once each, and the slots this plan has already taken on them.
  const laterDays: Record<string, Awaited<ReturnType<typeof prisma.appointment.findMany>>> = {};
  const laterTaken: { date: string; team: string[]; room: string; patient: string; s: number; e: number }[] = [];
  const unplaced: Unplaced[] = [];
  const writes: { appointment_id: string; before: Record<string, unknown>; after: Record<string, unknown> }[] = [];

  // The admin's own choices go down first, so the rest of the plan fits around
  // them rather than the other way round.
  for (const appt of mine) {
    const pin = pinnedBy.get(appt.id);
    if (!pin) continue;
    const therapy = therapyById.get(appt.therapy_id);
    const patient = patientById.get(appt.patient_id);
    const s = toMinutes(pin.start_time);
    const e = s + appt.duration_minutes;
    const pinCo = pin.co_staff_ids || [];
    if (pin.date === ymd(date) && !pin.cancel) {
      for (const id of teamOf({ staff_id: pin.staff_id, co_staff_ids: pinCo })) addBusy(staffBusy, id, s, e);
      addBusy(roomBusy, pin.room_id, s, e);
      addBusy(patientBusy, appt.patient_id, s, e);
    }
    const move: Move = {
      appointment_id: appt.id,
      patient_name: patient?.name || 'Unknown',
      therapy_name: therapy?.name || 'Treatment',
      tier: pin.date === ymd(date) ? (pin.start_time === appt.start_time ? 1 : 2) : 3,
      from: { staff_name: staffById.get(appt.staff_id || '')?.name || 'Unassigned', start_time: appt.start_time, date: ymd(date) },
      to: {
        staff_id: pin.staff_id,
        co_staff_ids: pinCo,
        staff_name: teamName([pin.staff_id, ...pinCo]),
        start_time: pin.start_time,
        date: pin.date,
        room_id: pin.room_id,
      },
      pinned: true,
      cancel: pin.cancel || undefined,
    };
    moved.push(move);
    writes.push({
      appointment_id: appt.id,
      before: beforeOf(appt),
      after: pin.cancel ? { ...beforeOf(appt), status: 'cancelled' } : { staff_id: pin.staff_id, co_staff_ids: pinCo, room_id: pin.room_id, start_time: pin.start_time, scheduled_date: new Date(`${pin.date}T00:00:00.000Z`).toISOString() },
    });
  }

  for (const appt of mine) {
    if (pinnedBy.has(appt.id)) continue;
    const therapy = therapyById.get(appt.therapy_id);
    const patient = patientById.get(appt.patient_id);
    const duration = appt.duration_minutes;
    const start = toMinutes(appt.start_time);
    const names = {
      patient_name: patient?.name || 'Unknown',
      therapy_name: therapy?.name || 'Treatment',
      from: { staff_name: absent?.name || staffById.get(appt.staff_id || '')?.name || 'Unassigned', start_time: appt.start_time, date: ymd(date) },
    };

    const mustKeepTherapist = patient?.requires_preferred_staff && !opts.relaxPreferredStaff ? patient.preferred_staff_id : null;
    const needed = Math.max(1, therapy?.staff_required ?? 1);

    /** `today` false: a later day, where the absent therapist may be back. */
    const qualified = (s: (typeof staff)[number], today = true) => {
      if (today && s.id === staffId) return false;
      if (opts.excludeStaffIds?.includes(s.id)) return false;
      if (!s.specializations.includes(appt.therapy_id)) return false;
      if (enforceGender && therapy?.requires_gender_match && patient && s.gender !== patient.gender) return false;
      return true;
    };
    // The resident's own therapist first when they have one; the least busy
    // otherwise, so a swap does not pile the day onto one person.
    const candidates = staff
      .filter((s) => qualified(s))
      .sort((a, b) => {
        const pref = (s: string) => (patient?.preferred_staff_id === s ? -1 : 0);
        return pref(a.id) - pref(b.id) || (staffBusy[a.id]?.length || 0) - (staffBusy[b.id]?.length || 0);
      });

    /**
     * A full team for one slot, or null. Whoever is on the treatment already
     * and can stay, stays: a therapist off replaces one seat, not the pair.
     * `isFree` says whether someone can work that slot. `relax` drops the
     * resident's own-therapist lock, for "another therapist this time only".
     */
    const teamFor = (isFree: (sid: string) => boolean, today = true, relax = false): string[] | null => {
      const ok = (sid: string, team: string[]) => {
        const s = staffById.get(sid);
        return Boolean(s && qualified(s, today) && isFree(sid) && !team.includes(sid));
      };
      const team: string[] = [];
      const lock = relax ? null : mustKeepTherapist;
      if (lock) {
        if (!ok(lock, team)) return null;
        team.push(lock);
      }
      for (const sid of teamOf(appt)) if (team.length < needed && ok(sid, team)) team.push(sid);
      for (const s of candidates) if (team.length < needed && ok(s.id, team)) team.push(s.id);
      return team.length === needed ? team : null;
    };

    const canTake = (sid: string, s: number, e: number) => free(staffBusy[sid], s, e);
    const roomFor = (s: number, e: number) => {
      if (appt.room_id && free(roomBusy[appt.room_id], s, e)) return appt.room_id;
      const alt = rooms.find(
        (r) => (therapy?.required_amenities || []).every((a) => r.amenities.includes(a)) && free(roomBusy[r.id], s, e),
      );
      return alt?.id ?? null;
    };

    type Slot = { team: string[]; start: number; room: string; tier: 1 | 2 | 3; date: string };
    /** Tier 1, else tier 2: this day, first the same time and then any time. */
    const sameDay = (relax: boolean): Slot | null => {
      const team = teamFor((sid) => canTake(sid, start, start + duration), true, relax);
      const room = team && roomFor(start, start + duration);
      if (team && room) return { team, start, room, tier: 1, date: ymd(date) };
      for (let t = firstSlot; t + duration <= close; t += 30) {
        if (!free(patientBusy[appt.patient_id], t, t + duration)) continue;
        const r = roomFor(t, t + duration);
        if (!r) continue;
        const tm = teamFor((sid) => canTake(sid, t, t + duration), true, relax);
        if (tm) return { team: tm, start: t, room: r, tier: 2, date: ymd(date) };
      }
      return null;
    };
    /**
     * The first later day and time, within `days`, where the team, a room and
     * the resident are all free. Any time in the centre's hours, not only the
     * same one, and never on top of the resident's own day. `inStay` stops at
     * the end of the resident's stay.
     */
    const laterSlot = async (days: number, inStay: boolean): Promise<Slot | null> => {
      for (let i = 1; i <= days; i++) {
        const other = new Date(date);
        other.setDate(date.getDate() + i);
        if (inStay && patient?.available_to && other > patient.available_to) return null;
        const key = ymd(other);
        const otherDay = (laterDays[key] ??= await prisma.appointment.findMany({ where: { scheduled_date: other, status: { not: 'cancelled' } } }));
        const taken = laterTaken.filter((x) => x.date === key);
        const hits = (a: { start_time: string; duration_minutes: number }, s: number, e: number) =>
          overlaps(toMinutes(a.start_time), toMinutes(a.start_time) + a.duration_minutes, s, e);
        for (let t = open; t + duration <= close; t += 30) {
          const e = t + duration;
          const patientFree = !otherDay.some((a) => a.patient_id === appt.patient_id && a.id !== appt.id && hits(a, t, e)) &&
            !taken.some((x) => x.patient === appt.patient_id && overlaps(x.s, x.e, t, e));
          if (!patientFree) continue;
          const busyThen = (sid: string) =>
            otherDay.some((a) => a.id !== appt.id && teamOf(a).includes(sid) && hits(a, t, e)) ||
            taken.some((x) => x.team.includes(sid) && overlaps(x.s, x.e, t, e)) ||
            staffEventBusy(events, sid, other).some((b) => overlaps(b.s, b.e, t, e)) ||
            offOnDay(timeOff, 'staff', sid, other).some((b) => overlaps(b.s, b.e, t, e));
          const team = teamFor((sid) => !busyThen(sid), false);
          if (!team) continue;
          const room = rooms.find(
            (r) =>
              (therapy?.required_amenities || []).every((a) => r.amenities.includes(a)) &&
              !otherDay.some((a) => a.id !== appt.id && a.room_id === r.id && hits(a, t, e)) &&
              !taken.some((x) => x.room === r.id && overlaps(x.s, x.e, t, e)) &&
              !offOnDay(timeOff, 'room', r.id, other).some((b) => overlaps(b.s, b.e, t, e)),
          );
          if (room) return { team, start: t, room: room.id, tier: 3, date: key };
        }
      }
      return null;
    };

    const moveOf = (slot: Slot, extra: Partial<Move> = {}): Move => {
      const [lead, ...co] = slot.team;
      return {
        appointment_id: appt.id,
        ...names,
        tier: slot.tier,
        to: { staff_id: lead, co_staff_ids: co, staff_name: teamName(slot.team), start_time: minutesToTime(slot.start), date: slot.date, room_id: slot.room },
        ...extra,
      };
    };
    /** Hold the slot in the running picture, so no later answer takes it too. */
    const hold = (slot: Slot) => {
      const end = slot.start + duration;
      if (slot.date !== ymd(date)) {
        laterTaken.push({ date: slot.date, team: slot.team, room: slot.room, patient: appt.patient_id, s: slot.start, e: end });
        return;
      }
      for (const sid of slot.team) addBusy(staffBusy, sid, slot.start, end);
      addBusy(roomBusy, slot.room, slot.start, end);
      addBusy(patientBusy, appt.patient_id, slot.start, end);
    };

    // Tiers 1 and 2 — this day, applied.
    const here = sameDay(false);
    if (here) {
      hold(here);
      moved.push(moveOf(here));
      writes.push({
        appointment_id: appt.id,
        before: beforeOf(appt),
        after: { staff_id: here.team[0], co_staff_ids: here.team.slice(1), room_id: here.room, start_time: minutesToTime(here.start) },
      });
      continue;
    }

    const ownName = staffById.get(mustKeepTherapist || '')?.name || 'their therapist';
    // Tier 3 — locked to one therapist: that therapist's next free slot, soon.
    if (mustKeepTherapist) {
      const soon = await laterSlot(3, true);
      if (soon) {
        hold(soon);
        proposed.push(moveOf(soon, { note: 'their own therapist' }));
        continue;
      }
    }

    // Tier 4 — ask. Up to three choices, the best one selected.
    const daysLater = (d: string) => Math.round((Date.parse(d) - Date.parse(ymd(date))) / 86400000);
    const choices: Move[] = [];
    const thisTime = mustKeepTherapist ? sameDay(true) : null;
    if (thisTime) choices.push(moveOf(thisTime, { choice: 'this_time_only', note: `this time only; ${ownName} stays their therapist` }));
    // Their own therapist when locked, anyone qualified otherwise. Past the stay
    // too, so the admin sees how far it is rather than nothing.
    const next = await laterSlot(30, false);
    const inStay = next && (!patient?.available_to || new Date(`${next.date}T00:00:00.000Z`) <= patient.available_to);
    if (next) {
      const n = daysLater(next.date);
      choices.push(moveOf(next, { choice: 'next_free_day', note: `${n} day${n === 1 ? '' : 's'} later${inStay ? '' : ', after their stay ends'}` }));
    }
    choices.push({
      appointment_id: appt.id,
      ...names,
      tier: 2,
      choice: 'cancel',
      cancel: true,
      note: 'kept as cancelled, can be undone',
      to: { staff_id: appt.staff_id, co_staff_ids: appt.co_staff_ids, staff_name: '', start_time: appt.start_time, date: ymd(date), room_id: appt.room_id },
    });
    const nextMove = choices.find((c) => c.choice === 'next_free_day');
    const thisMove = choices.find((c) => c.choice === 'this_time_only');
    // Cancel is never picked for the admin.
    const pick = next && inStay && daysLater(next.date) <= 3 ? nextMove : thisMove || nextMove;
    if (pick) {
      hold(pick === thisMove ? thisTime! : next!);
      proposed.push({ ...pick, choices });
      continue;
    }

    writes.push({
      appointment_id: appt.id,
      before: beforeOf(appt),
      // The absent therapist's name comes off: it reads as covered, and the
      // warning has to stay lit until someone deals with it. Anyone else on the
      // treatment is still coming in, so they stay on it.
      after: {
        staff_id: appt.staff_id === staffId ? null : appt.staff_id,
        co_staff_ids: appt.co_staff_ids.filter((id) => id !== staffId),
        room_id: appt.room_id,
        start_time: appt.start_time,
      },
    });
    unplaced.push({
      appointment_id: appt.id,
      patient_name: names.patient_name,
      therapy_name: names.therapy_name,
      start_time: appt.start_time,
      choices,
      reason: candidates.length === 0
        ? `No other therapist is trained in ${names.therapy_name}${enforceGender && therapy?.requires_gender_match ? ` and matches the resident's gender` : ''}. It can be cancelled.`
        : `Every therapist trained in ${names.therapy_name} is booked for the next 30 days. It can be cancelled.`,
    });
  }

  let batch_id: string | null = null;
  if (opts.apply && writes.length > 0) {
    for (const w of writes) {
      await prisma.appointment.update({
        where: { id: w.appointment_id },
        data: {
          staff_id: (w.after.staff_id as string | null) ?? null,
          co_staff_ids: (w.after.co_staff_ids as string[] | undefined) ?? [],
          room_id: (w.after.room_id as string | null) ?? null,
          start_time: w.after.start_time as string,
          // A pinned row can be on another day; everything the planner decides
          // by itself stays on this one.
          scheduled_date: w.after.scheduled_date ? new Date(w.after.scheduled_date as string) : undefined,
          status: w.after.status === 'cancelled' ? 'cancelled' : undefined,
        },
      });
    }
    const row = await prisma.auditLog.create({
      data: {
        admin_id: 'admin',
        action: 'replan',
        entity_type: 'staff',
        entity_id: staffId ?? '',
        old_value: { writes, time_off_id: opts.timeOffId ?? null, date: ymd(date) } as unknown as Prisma.InputJsonValue,
        new_value: { moved, proposed, unplaced, staff_name: absent?.name || '' } as unknown as Prisma.InputJsonValue,
      },
    });
    batch_id = row.id;
  }

  return { batch_id, staff_name: absent?.name || 'Therapist', date: ymd(date), moved, proposed, unplaced };
}

/**
 * Write a plan the admin has confirmed, as one batch with one Undo.
 *
 * The moves are checked once more on the way in, because the plan was worked
 * out a moment ago and the day may have moved since — a refusal here is the
 * whole point of the guard, not a surprise.
 */
export async function applyPlan(
  moves: { appointment_id: string; staff_id: string | null; co_staff_ids?: string[]; room_id: string | null; start_time: string; date: string; cancel?: boolean }[],
  prisma: PrismaClient,
): Promise<{ batch_id: string; applied: number }> {
  const writes: { appointment_id: string; before: Record<string, unknown>; after: Record<string, unknown> }[] = [];
  for (const m of moves) {
    const before = await prisma.appointment.findUnique({ where: { id: m.appointment_id } });
    if (!before) continue;
    if (m.cancel) {
      // Kept, not deleted: Undo puts it back as it was.
      await prisma.appointment.update({ where: { id: m.appointment_id }, data: { status: 'cancelled' } });
    } else {
      await prisma.appointment.update({
        where: { id: m.appointment_id },
        data: { staff_id: m.staff_id, co_staff_ids: m.co_staff_ids ?? [], room_id: m.room_id, start_time: m.start_time, scheduled_date: new Date(`${m.date}T00:00:00.000Z`) },
      });
    }
    writes.push({
      appointment_id: m.appointment_id,
      before: { status: before.status, staff_id: before.staff_id, co_staff_ids: before.co_staff_ids, room_id: before.room_id, start_time: before.start_time, scheduled_date: before.scheduled_date.toISOString() },
      after: { staff_id: m.staff_id, co_staff_ids: m.co_staff_ids ?? [], room_id: m.room_id, start_time: m.start_time, scheduled_date: `${m.date}T00:00:00.000Z` },
    });
  }
  const row = await prisma.auditLog.create({
    data: {
      admin_id: 'admin',
      action: 'dayfix',
      entity_type: 'appointment',
      entity_id: writes[0]?.appointment_id || '',
      old_value: { writes, date: moves[0]?.date ?? null } as unknown as Prisma.InputJsonValue,
      new_value: { applied: writes.length } as unknown as Prisma.InputJsonValue,
    },
  });
  return { batch_id: row.id, applied: writes.length };
}

/**
 * A therapist's whole day, rehoused. The absence path and the button in Verify
 * both come here, and it is `planDay` underneath — one ladder, one set of rules.
 */
export const replanStaffDay = (
  staffId: string,
  date: Date,
  prisma: PrismaClient,
  opts: { apply?: boolean; timeOffId?: string; now?: Clock } = {},
) => planDay(staffId, date, prisma, opts);

/** Put a replan back exactly as it was. */
export async function undoReplan(batchId: string, prisma: PrismaClient) {
  const row = await prisma.auditLog.findUnique({ where: { id: batchId } });
  if (!row || (row.action !== 'replan' && row.action !== 'dayfix')) return null;
  const payload = row.old_value as unknown as { writes: { appointment_id: string; before: Record<string, unknown> }[] };
  for (const w of payload.writes || []) {
    await prisma.appointment.update({
      where: { id: w.appointment_id },
      data: {
        staff_id: (w.before.staff_id as string | null) ?? null,
        // A batch written before co-therapists existed has no list; it had none.
        co_staff_ids: (w.before.co_staff_ids as string[] | undefined) ?? [],
        room_id: (w.before.room_id as string | null) ?? null,
        start_time: w.before.start_time as string,
        scheduled_date: new Date(w.before.scheduled_date as string),
        // Older batches did not record it; they never changed it.
        ...(w.before.status ? { status: w.before.status as 'pending' } : {}),
      },
    });
  }
  const summary = row.new_value as unknown as { staff_name?: string; moved?: Move[]; unplaced?: Unplaced[] };
  const restored = (summary.moved || []).length + (summary.unplaced || []).length;
  await prisma.auditLog.update({ where: { id: batchId }, data: { action: 'replan_undone' } });
  return { staff_name: summary.staff_name || 'The therapist', restored };
}
