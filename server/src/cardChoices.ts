/**
 * The treatment card's lists (#136): for one treatment, the times, therapists,
 * rooms and treatments it could change to. Every option is put through the same
 * guard a booking goes through, so the card never offers what a save would
 * refuse. The browser only shows these.
 */
import type { PrismaClient } from '@prisma/client';
import { centreClosed, eventHitsDay, gives, hoursOn, overlaps, staffAwayOnDay, type EventRow } from './availability.js';
import { HAPPENING, findConflict, loadDay, oncePerCourse, softWarnings, type Action, type Candidate, type Soft } from './appointmentGuard.js';

export type Kind = 'time' | 'staff' | 'room' | 'therapy';
/** `now` marks the treatment as it stands, listed first so the admin sees what they change from (#201). */
export type Choice = { label: string; hint?: string; best?: boolean; now?: boolean; change: Record<string, unknown> };

const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Inside a therapist's or room's weekly hours, read as the scheduler reads them (09:00–18:00 when unset). */
const works = (weekly: unknown, day: Date, start: number, minutes: number) => {
  const h = hoursOn(weekly, day);
  if (h === null) return false;
  const { s, e } = h ?? { s: 9 * 60, e: 18 * 60 };
  return start >= s && start + minutes <= e;
};

/** How many rows a list shows: enough to choose, few enough to read on a phone. */
const MAX = 5;
const DAY_MS = 86400000;
/** "Tue 29 Sep", for an option on another day. */
const dayLabel = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');

export async function cardChoices(appointmentId: string, kind: Kind, nowMinutes: number | null, prisma: PrismaClient): Promise<Choice[] | null> {
  const a = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!a) return null;
  const ctx = await loadDay(a.scheduled_date, prisma);
  const base: Candidate = {
    id: a.id, scheduled_date: a.scheduled_date, start_time: a.start_time, duration_minutes: a.duration_minutes,
    staff_id: a.staff_id, co_staff_ids: a.co_staff_ids, room_id: a.room_id, patient_id: a.patient_id, therapy_id: a.therapy_id,
  };
  const fits = (c: Partial<Candidate>) => !findConflict({ ...base, ...c }, ctx);
  const out: Choice[] = [];

  const nameOf = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name || '';
  const start = toM(a.start_time);

  if (kind === 'time') {
    out.push({ label: `${a.start_time} to ${hm(start + a.duration_minutes)}`, now: true, change: {} });
    const open = toM(ctx.settings?.opening_time || '09:00');
    const close = toM(ctx.settings?.closing_time || '18:00');
    const team = ctx.staff.filter((x) => x.id === a.staff_id || a.co_staff_ids.includes(x.id));
    const rooms = ctx.rooms.filter((r) => r.is_active);
    /** The first times from `from` on `day` that fit, in `roomIds`, as options. */
    const scan = (day: Date, dayCtx: typeof ctx, from: number, roomIds: (string | null)[], limit: number, label: (t: number, room: string | null) => string) => {
      const found: Choice[] = [];
      for (let t = Math.ceil(from / 15) * 15; t + a.duration_minutes <= close && found.length < limit; t += 15) {
        if (!team.every((x) => works(x.weekly_schedule, day, t, a.duration_minutes))) continue;
        for (const roomId of roomIds) {
          const room = rooms.find((x) => x.id === roomId);
          if (room && !works(room.weekly_schedule, day, t, a.duration_minutes)) continue;
          const change: Record<string, unknown> = { start_time: hm(t) };
          if (roomId !== a.room_id) change.room_id = roomId;
          if (day.getTime() !== a.scheduled_date.getTime()) change.scheduled_date = day.toISOString().slice(0, 10);
          if (day.getTime() === a.scheduled_date.getTime() && t === start && roomId === a.room_id) continue;
          if (findConflict({ ...base, scheduled_date: day, start_time: hm(t), room_id: roomId }, dayCtx)) continue;
          found.push({ label: label(t, roomId), change });
          break;
        }
      }
      return found;
    };
    // Later the same day, same therapist and room: what "running late" and "move" need most.
    // From now on today, never into the past.
    const from = Math.max(open, nowMinutes ?? open);
    const sameRoom = scan(a.scheduled_date, ctx, from, [a.room_id], 3, (t) => `${hm(t)} to ${hm(t + a.duration_minutes)}`)
      .map((c) => { const diff = toM(String(c.change.start_time)) - start; return { ...c, hint: diff > 0 ? `+${diff} min` : `${diff} min` }; });
    // Another room today, for when this one is the problem (#201).
    const taken = new Set(sameRoom.map((c) => c.change.start_time));
    const otherRooms = scan(a.scheduled_date, ctx, from, rooms.map((r) => r.id).filter((id) => id !== a.room_id), 4, (t, r) => `Today ${hm(t)}, ${nameOf(rooms, r)}`)
      .filter((c) => !taken.has(c.change.start_time)).slice(0, 2);
    // The next days the same therapist and room are free at a similar hour.
    // Only while the resident is staying: the scheduler never books outside a stay (#142).
    const stays = await prisma.patientStay.findMany({ where: { patient_id: a.patient_id } });
    const later: Choice[] = [];
    for (let d = 1; d <= 7 && later.length < 2; d++) {
      const day = new Date(a.scheduled_date.getTime() + d * DAY_MS);
      if (stays.length && !stays.some((x) => x.start_date <= day && day <= x.end_date)) continue;
      const dayCtx = await loadDay(day, prisma);
      const [c] = scan(day, dayCtx, Math.max(open, start - 60), [a.room_id], 1, (t) => `${dayLabel(day)}, ${hm(t)}`);
      if (c) later.push(c);
    }
    const options = [...sameRoom, ...otherRooms, ...later];
    if (options.length) options[0].best = true;
    return [...out, ...options];
  }

  // The list's first row: the treatment as it stands (#201).
  if (kind === 'staff') out.push({ label: [a.staff_id, ...a.co_staff_ids].map((id) => nameOf(ctx.staff, id)).filter(Boolean).join(' and ') || 'No therapist', now: true, change: {} });
  if (kind === 'room') out.push({ label: nameOf(ctx.rooms, a.room_id) || 'No room', now: true, change: {} });
  if (kind === 'therapy') {
    const t = ctx.therapies.find((x) => x.id === a.therapy_id);
    out.push({ label: `${t?.name || 'Treatment'} · ${a.duration_minutes} min`, now: true, change: {} });
  }
  const offered = () => out.length - 1;

  if (kind === 'staff') {
    const held = ctx.therapies.find((x) => x.id === a.therapy_id);
    for (const s of ctx.staff) {
      if (!s.is_active || s.id === a.staff_id || a.co_staff_ids.includes(s.id)) continue;
      // Only someone who can give it.
      if (!held || !gives(s, held)) continue;
      if (!works(s.weekly_schedule, a.scheduled_date, toM(a.start_time), a.duration_minutes)) continue;
      if (fits({ staff_id: s.id })) out.push({ label: s.name, best: offered() === 0, change: { staff_id: s.id } });
      if (offered() >= MAX) break;
    }
    return out;
  }

  if (kind === 'room') {
    for (const r of ctx.rooms) {
      if (!r.is_active || r.id === a.room_id) continue;
      if (!works(r.weekly_schedule, a.scheduled_date, toM(a.start_time), a.duration_minutes)) continue;
      if (fits({ room_id: r.id })) out.push({ label: r.name, best: offered() === 0, change: { room_id: r.id } });
      if (offered() >= MAX) break;
    }
    return out;
  }

  // Another treatment in the same time, with the same therapist and room.
  for (const t of ctx.therapies) {
    if (t.id === a.therapy_id) continue;
    const staffOk = [a.staff_id, ...a.co_staff_ids].filter(Boolean).every((id) => {
      const s = ctx.staff.find((x) => x.id === id);
      return !s || gives(s, t);
    });
    if (!staffOk) continue;
    if (fits({ therapy_id: t.id, duration_minutes: t.duration_minutes })) {
      out.push({ label: `${t.name} · ${t.duration_minutes} min`, change: { therapy_id: t.id, duration_minutes: t.duration_minutes } });
    }
    if (offered() >= MAX) break;
  }
  return out;
}

export type Suggestion = {
  patient_id: string; patient_name: string; therapy_id: string; therapy_name: string;
  start_time: string; duration_minutes: number; staff_id: string; staff_name: string; co_staff_ids: string[]; room_id: string; room_name: string;
};

/**
 * Who to book next from the + button (#136): residents in house with the
 * fewest treatments so far in their stay, each with their own therapy (the one
 * they had last) at its first time from now that the guard accepts.
 */
/** With `pick`, one resident and therapy chosen by the admin ("Someone else…", #273 H2): their next free times instead. */
export async function bookingSuggestions(dayISO: string, nowMinutes: number | null, prisma: PrismaClient, limit = 3, pick?: { patient_id: string; therapy_id: string }): Promise<Suggestion[]> {
  const day = new Date(`${dayISO}T00:00:00.000Z`);
  const ctx = await loadDay(day, prisma);
  const stays = await prisma.patientStay.findMany({ where: { start_date: { lte: day }, end_date: { gte: day }, ...(pick && { patient_id: pick.patient_id }) } });
  const ids = stays.map((s) => s.patient_id);
  const history = await prisma.appointment.findMany({
    where: { patient_id: { in: ids }, status: { notIn: ['cancelled', 'no_show'] } },
    orderBy: { scheduled_date: 'desc' },
    select: { patient_id: true, therapy_id: true, scheduled_date: true },
  });
  const ranked = pick ? stays.slice(0, 1).map((stay) => ({ stay, done: 0, therapy_id: pick.therapy_id })) : stays
    .map((s) => {
      const theirs = history.filter((h) => h.patient_id === s.patient_id);
      const done = theirs.filter((h) => h.scheduled_date >= s.start_date && h.scheduled_date <= day).length;
      return { stay: s, done, therapy_id: theirs[0]?.therapy_id };
    })
    .filter((r) => r.therapy_id)
    .sort((a, b) => a.done - b.done);

  const open = toM(ctx.settings?.opening_time || '09:00');
  const close = toM(ctx.settings?.closing_time || '18:00');
  const from = Math.ceil(Math.max(open, nowMinutes ?? open) / 15) * 15;
  const out: Suggestion[] = [];
  for (const r of ranked) {
    const therapy = ctx.therapies.find((t) => t.id === r.therapy_id);
    if (!therapy) continue;
    // ponytail: first fit by time, then therapist, then room; the planner's scoring if a centre asks for better.
    for (let t = from; t + therapy.duration_minutes <= close; t += 15) {
      const a = assign(ctx, day, t, therapy, r.stay.patient_id);
      if (!a) continue;
      out.push(a);
      if (!pick || out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

type Ctx = Awaited<ReturnType<typeof loadDay>>;

/** The first therapist (and co-therapists) and room the guard accepts for this patient and therapy at `t`. */
function assign(ctx: Ctx, day: Date, t: number, therapy: Ctx['therapies'][number], patientId: string, preferred?: { staff_id?: string; room_id?: string }): Suggestion | null {
  const staff = ctx.staff.filter((s) => s.is_active && gives(s, therapy));
  const rooms = ctx.rooms.filter((x) => x.is_active);
  const first = <T extends { id: string }>(l: T[], id?: string) => (id ? [...l.filter((x) => x.id === id), ...l.filter((x) => x.id !== id)] : l);
  for (const s of first(staff, preferred?.staff_id)) for (const room of first(rooms, preferred?.room_id)) {
    if (!works(s.weekly_schedule, day, t, therapy.duration_minutes) || !works(room.weekly_schedule, day, t, therapy.duration_minutes)) continue;
    const c: Candidate = { scheduled_date: day, start_time: hm(t), duration_minutes: therapy.duration_minutes, staff_id: s.id, co_staff_ids: [], room_id: room.id, patient_id: patientId, therapy_id: therapy.id };
    // A therapy given by two or more: add each further therapist the guard has nothing against but the head count.
    const co: string[] = [];
    for (const o of staff) {
      if (co.length >= (therapy.staff_required ?? 1) - 1) break;
      if (o.id === s.id || !works(o.weekly_schedule, day, t, therapy.duration_minutes)) continue;
      const short = findConflict({ ...c, co_staff_ids: [...co, o.id] }, ctx);
      if (!short || short.reason === 'STAFF_SHORT') co.push(o.id);
    }
    c.co_staff_ids = co;
    if (findConflict(c, ctx)) continue;
    const p = ctx.patients.find((x) => x.id === patientId);
    return { patient_id: c.patient_id, patient_name: p?.name || '', therapy_id: therapy.id, therapy_name: therapy.name, start_time: c.start_time, duration_minutes: c.duration_minutes, staff_id: s.id, staff_name: [s, ...co.map((id) => staff.find((x) => x.id === id)!)].map((x) => x.name).join(' and '), co_staff_ids: co, room_id: room.id, room_name: room.name };
  }
  return null;
}

export type Option = { id: string; name: string; free: boolean; why?: string };
export type BookingOptions = { times: Suggestion[]; staff: Option[]; rooms: Option[]; why?: string; actions: Action[]; warnings: Soft[] };

/**
 * The one booking sheet's lists (#285 story 5): every free time for this patient
 * and therapy that day, best first, and for the chosen time each therapist and
 * room with whether it is free and, if not, why. Busy ones are listed, greyed in
 * the app, so a clash is never picked by accident.
 */
export async function bookingOptions(dayISO: string, nowMinutes: number | null, pick: { patient_id: string; therapy_id: string }, at: string | undefined, prisma: PrismaClient): Promise<BookingOptions | null> {
  const day = new Date(`${dayISO}T00:00:00.000Z`);
  const ctx = await loadDay(day, prisma);
  const therapy = ctx.therapies.find((t) => t.id === pick.therapy_id);
  const patient = ctx.patients.find((x) => x.id === pick.patient_id);
  if (!therapy || !patient) return null;
  const stay = await prisma.patientStay.findFirst({ where: { patient_id: patient.id, start_date: { lte: day }, end_date: { gte: day } } });
  if (!stay) return { times: [], staff: [], rooms: [], ...(await notStaying(patient.id, day, prisma)), warnings: [] };
  const open = toM(ctx.settings?.opening_time || '09:00');
  const close = toM(ctx.settings?.closing_time || '18:00');
  const times: Suggestion[] = [];
  // ponytail: every quarter hour of the day, each checked once; fine for a centre's size.
  for (let t = Math.ceil(Math.max(open, nowMinutes ?? open) / 15) * 15; t + therapy.duration_minutes <= close; t += 15) {
    const a = assign(ctx, day, t, therapy, patient.id);
    if (a) times.push(a);
  }
  const once = await oncePerCourse({ patient_id: patient.id, therapy_id: therapy.id, scheduled_date: day }, prisma);
  const warnings = [...softWarnings({ patient_id: patient.id, therapy_id: therapy.id }, ctx), ...(once ? [once] : [])];
  if (!times.length) return { times, staff: [], rooms: [], ...(await noTimeWhy(ctx, day, nowMinutes, therapy, patient, stay, prisma)), warnings };
  const chosen = times.find((x) => x.start_time === at) || times[0];
  const base: Candidate = { scheduled_date: day, start_time: chosen.start_time, duration_minutes: chosen.duration_minutes, staff_id: chosen.staff_id, co_staff_ids: chosen.co_staff_ids, room_id: chosen.room_id, patient_id: patient.id, therapy_id: therapy.id };
  const t0 = toM(chosen.start_time);
  const staff: Option[] = ctx.staff.filter((s) => s.is_active && gives(s, therapy)).map((s) => {
    const off = !works(s.weekly_schedule, day, t0, therapy.duration_minutes);
    const c = off ? null : findConflict({ ...base, staff_id: s.id, co_staff_ids: base.co_staff_ids?.map((id) => (id === s.id ? base.staff_id! : id)) }, ctx);
    return { id: s.id, name: s.name, free: !off && !c, why: off ? 'not working then' : c?.reason === 'STAFF_BUSY' ? 'has a treatment' : c?.reason === 'STAFF_OFF' ? 'not in' : c?.reason === 'STAFF_IN_EVENT' ? 'in an event' : c ? c.message : undefined };
  });
  const rooms: Option[] = ctx.rooms.filter((r) => r.is_active).map((r) => {
    const off = !works(r.weekly_schedule, day, t0, therapy.duration_minutes);
    const c = off ? null : findConflict({ ...base, room_id: r.id }, ctx);
    return { id: r.id, name: r.name, free: !off && !c, why: off ? 'closed then' : c?.reason === 'ROOM_BUSY' ? 'in use' : c?.reason === 'ROOM_OFF' ? 'out of use' : c ? c.message : undefined };
  });
  const byFree = (a: Option, b: Option) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name);
  return { times, staff: staff.sort(byFree), rooms: rooms.sort(byFree), actions: [], warnings };
}

/** The patient's stay nearest the day, said in words, with a way forward: go to a day they are here, or change the stay (#330). */
export async function notStaying(patientId: string, day: Date, prisma: PrismaClient): Promise<{ why: string; actions: Action[] }> {
  const stays = await prisma.patientStay.findMany({ where: { patient_id: patientId } });
  const gap = (s: { start_date: Date; end_date: Date }) => (day < s.start_date ? s.start_date.getTime() - day.getTime() : day.getTime() - s.end_date.getTime());
  const near = [...stays].sort((a, b) => gap(a) - gap(b))[0];
  const change: Action = { kind: 'change_stay', label: 'Change their stay', patient_id: patientId };
  if (!near) return { why: 'They have no stay yet.', actions: [change] };
  const go = day < near.start_date ? near.start_date : near.end_date;
  return {
    why: `Their stay runs ${dayLabel(near.start_date)} to ${dayLabel(near.end_date)}.`,
    actions: [{ kind: 'set_date', label: `Go to ${dayLabel(go)}`, date: go.toISOString().slice(0, 10) }, change],
  };
}

/** The first time on a later day of the stay (to a fortnight on) that the patient, a therapist and a room are all free. */
async function nextFreeSlot(day: Date, stayEnd: Date, therapy: Ctx['therapies'][number], patientId: string, prisma: PrismaClient): Promise<{ date: Date; start_time: string } | null> {
  for (let d = 1; d <= 14; d++) {
    const next = new Date(day.getTime() + d * DAY_MS);
    if (next > stayEnd) return null;
    const ctx = await loadDay(next, prisma);
    // The guard refuses a closed day (CENTER_HOLIDAY), so offering one would fail on tap (#344, #393).
    if (centreClosed(ctx.settings, ctx.timeOff, next)) continue;
    const open = toM(ctx.settings?.opening_time || '09:00');
    const close = toM(ctx.settings?.closing_time || '18:00');
    for (let t = Math.ceil(open / 15) * 15; t + therapy.duration_minutes <= close; t += 15) {
      const a = assign(ctx, next, t, therapy, patientId);
      if (a) return { date: next, start_time: a.start_time };
    }
  }
  return null;
}

/**
 * Too few of the people who give a therapy are in that day (#476): leave or
 * hours, not a full diary. "No free time" would send the admin hunting for a time.
 */
function fewIn(ctx: Ctx, day: Date, therapy: Ctx['therapies'][number], patient: Ctx['patients'][number]): string | null {
  const gendered = therapy.requires_gender_match && ctx.settings?.enforce_gender_match !== false;
  const needed = therapy.staff_required ?? 1;
  const open = toM(ctx.settings?.opening_time || '09:00');
  const close = toM(ctx.settings?.closing_time || '18:00');
  const inThen = ctx.staff.filter((s) => s.is_active && gives(s, therapy) && (!gendered || s.gender === patient.gender)).filter((s) => {
    const away = staffAwayOnDay(ctx.timeOff, s, day);
    for (let t = open; t + therapy.duration_minutes <= close; t += 15) if (!away.some((b) => overlaps(b.s, b.e, t, t + therapy.duration_minutes))) return true;
    return false;
  });
  if (inThen.length >= needed) return null;
  const first = patient.name.split(' ')[0];
  const who = therapy.is_consultation ? 'a doctor' : `${needed === 1 ? 'a therapist' : `${needed} therapists`}${gendered ? ` of ${first}'s gender` : ''}`;
  return `${therapy.name} needs ${who}, and ${inThen.length ? `only ${inThen.map((s) => s.name).join(' and ')} ${inThen.length === 1 ? 'is' : 'are'} in` : 'nobody who gives it is in'} that day.`;
}

/** Why a chosen therapy has no time that day, and what to do about it: never only text over a greyed button (#330). */
async function noTimeWhy(ctx: Ctx, day: Date, nowMinutes: number | null, therapy: Ctx['therapies'][number], patient: Ctx['patients'][number], stay: { end_date: Date }, prisma: PrismaClient): Promise<{ why: string; actions: Action[] }> {
  const other: Action = { kind: 'other_therapy', label: 'Try another therapy' };
  const team = await whyNoTime(day.toISOString().slice(0, 10), { patient_id: patient.id, therapy_id: therapy.id }, prisma);
  if (team) {
    const gendered = therapy.requires_gender_match && ctx.settings?.enforce_gender_match !== false;
    const needed = therapy.staff_required ?? 1;
    const able = ctx.staff.filter((s) => s.is_active && gives(s, therapy)).length;
    // The gender rule is the cause when, without it, there would be enough hands.
    if (gendered && able >= needed) {
      return { why: team, actions: [
        { kind: 'add_staff', label: `Add a ${patient.gender === 'female' ? 'female' : 'male'} therapist`, gender: patient.gender, therapy_id: therapy.id },
        { kind: 'allow_any_gender', label: `Allow any gender for ${therapy.name.replace(/_/g, ' ')}`, therapy_id: therapy.id },
        other,
      ] };
    }
    return { why: team, actions: [{ kind: 'add_staff', label: therapy.is_consultation ? 'Add a doctor' : 'Add a therapist', therapy_id: therapy.id }, other] };
  }
  // No room has everything the therapy needs: the cause, and the fix filled in (#544). A consultation needs a BP monitor and an examination bed, which a therapy room rarely has.
  const needs = therapy.required_amenities ?? [];
  const live = ctx.rooms.filter((r) => r.is_active !== false);
  if (needs.length && !live.some((r) => needs.every((a) => r.amenities.includes(a)))) {
    const say = needs.map((a) => a.replace(/_/g, ' '));
    const list = say.length > 1 ? `${say.slice(0, -1).join(', ')} and ${say[say.length - 1]}` : say[0];
    return { why: `No room has ${list}, so ${therapy.name.replace(/_/g, ' ')} cannot be booked yet.`, actions: [{ kind: 'add_room', label: 'Add a room that has them', amenities: needs }, other] };
  }
  const next = await nextFreeSlot(day, stay.end_date, therapy, patient.id, prisma);
  // The hours are over when the day would have had a time but for the clock.
  let over = false;
  if (nowMinutes !== null) {
    const close = toM(ctx.settings?.closing_time || '18:00');
    for (let t = Math.ceil(toM(ctx.settings?.opening_time || '09:00') / 15) * 15; !over && t + therapy.duration_minutes <= close; t += 15) over = !!assign(ctx, day, t, therapy, patient.id);
  }
  const closed = centreClosed(ctx.settings, ctx.timeOff, day);
  const why = closed ? `The centre is ${closed}.` : over ? "Today's hours are over." : fewIn(ctx, day, therapy, patient) ?? `No free time for ${patient.name.split(' ')[0]} that day.`;
  if (!next) return { why: `${why} Nothing is free for the rest of their stay.`, actions: [other, { kind: 'change_stay', label: 'Change their stay', patient_id: patient.id }] };
  // 'Tomorrow' only when the sheet is on today (it sends the clock only then); on another day it is a date.
  const tomorrow = nowMinutes !== null && next.date.getTime() - day.getTime() === DAY_MS;
  return { why, actions: [{ kind: 'book_at', label: `Book ${tomorrow ? 'tomorrow' : dayLabel(next.date)} at ${next.start_time}`, date: next.date.toISOString().slice(0, 10), start_time: next.start_time }, other] };
}

/**
 * The therapy list's facts for one patient on one day (#330): when they last had
 * each, and any already booked that day (greyed in the app, a soft rule). The
 * therapy is never preselected.
 */
export async function therapyFacts(dayISO: string, patientId: string, prisma: PrismaClient) {
  const day = new Date(`${dayISO}T00:00:00.000Z`);
  const [therapies, mine] = await Promise.all([
    prisma.therapy.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } }),
    prisma.appointment.findMany({ where: { patient_id: patientId, status: { notIn: ['cancelled', 'no_show'] } }, orderBy: [{ scheduled_date: 'desc' }, { start_time: 'desc' }], select: { therapy_id: true, scheduled_date: true, start_time: true } }),
  ]);
  const repeat = mine.find((a) => a.scheduled_date < day && !therapies.find((t) => t.id === a.therapy_id)?.is_consultation)?.therapy_id;
  return therapies.map((t) => {
    const same = mine.find((a) => a.therapy_id === t.id && a.scheduled_date.getTime() === day.getTime());
    const had = mine.find((a) => a.therapy_id === t.id && a.scheduled_date < day);
    return {
      id: t.id, name: t.name, duration_minutes: t.duration_minutes, is_consultation: t.is_consultation,
      taken: !!same, repeat: t.id === repeat,
      fact: same ? `already at ${same.start_time}` : had ? `had ${dayLabel(had.scheduled_date)}` : undefined,
    };
  });
}

/**
 * Who the booking sheet offers before anyone types (#285 story 5): at most five
 * in house with nothing booked that day, those furthest behind first, and a few
 * that were just booked. Everyone in house comes too, for the search under them.
 */
export async function bookingWho(dayISO: string, prisma: PrismaClient) {
  const day = new Date(`${dayISO}T00:00:00.000Z`);
  const stays = await prisma.patientStay.findMany({ where: { start_date: { lte: day }, end_date: { gte: day } }, include: { Patient: { select: { id: true, name: true } } } });
  const ids = stays.map((s) => s.patient_id);
  const appts = await prisma.appointment.findMany({
    where: { patient_id: { in: ids }, status: { notIn: ['cancelled', 'no_show'] } },
    orderBy: [{ scheduled_date: 'desc' }, { start_time: 'desc' }],
    select: { patient_id: true, therapy_id: true, scheduled_date: true, created_at: true, Therapy: { select: { name: true, is_consultation: true } } },
  });
  const rows = stays.map((s) => {
    const mine = appts.filter((a) => a.patient_id === s.patient_id);
    const last = mine.find((a) => !a.Therapy.is_consultation && a.scheduled_date <= day) ?? mine.find((a) => !a.Therapy.is_consultation);
    const today = mine.filter((a) => a.scheduled_date.getTime() === day.getTime());
    const n = Math.round((day.getTime() - s.start_date.getTime()) / DAY_MS) + 1;
    const of = Math.round((s.end_date.getTime() - s.start_date.getTime()) / DAY_MS) + 1;
    return {
      id: s.patient_id, name: s.Patient.name,
      // On a first day the only one may still be ahead: it is "next", not "last" (#395).
      note: `Day ${n} of ${of}${last ? ` · ${last.scheduled_date > day ? 'next' : 'last'}: ${last.Therapy.name.replace(/_/g, ' ')} ${dayLabel(last.scheduled_date)}` : ''}`,
      therapy_id: last?.therapy_id ?? null,
      last: last ? { name: last.Therapy.name, date: last.scheduled_date.toISOString().slice(0, 10) } : null,
      today: today.length,
      done: mine.filter((a) => a.scheduled_date >= s.start_date && a.scheduled_date <= day).length,
      booked_at: today.reduce((m, a) => Math.max(m, a.created_at.getTime()), 0),
    };
  });
  const none = rows.filter((r) => !r.today).sort((a, b) => a.done - b.done || a.name.localeCompare(b.name)).slice(0, 5);
  const recent = rows.filter((r) => r.today).sort((a, b) => b.booked_at - a.booked_at).slice(0, 3);
  const all = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  return { none, recent, all };
}

/**
 * Why a chosen resident and therapy got no time at all, when the reason is the
 * team and not the day: "no free time" would send the admin hunting for another day.
 */
export async function whyNoTime(dayISO: string, pick: { patient_id: string; therapy_id: string }, prisma: PrismaClient): Promise<string | undefined> {
  const ctx = await loadDay(new Date(`${dayISO}T00:00:00.000Z`), prisma);
  const therapy = ctx.therapies.find((t) => t.id === pick.therapy_id);
  const patient = ctx.patients.find((x) => x.id === pick.patient_id);
  if (!therapy || !patient) return undefined;
  const sameGender = therapy.requires_gender_match && ctx.settings?.enforce_gender_match !== false;
  const able = ctx.staff.filter((s) => s.is_active && gives(s, therapy) && (!sameGender || s.gender === patient.gender)).length;
  const needed = therapy.staff_required ?? 1;
  if (able >= needed) return undefined;
  // A consultation is given by a doctor (#460): naming a therapist sent the admin to add the wrong role.
  const who = therapy.is_consultation ? 'a doctor' : `${needed === 1 ? 'a therapist' : `${needed} therapists together`}${sameGender ? ` of ${patient.name.split(' ')[0]}'s gender` : ''}`;
  return `${therapy.name} needs ${who}, and ${able === 0 ? 'nobody here gives it yet' : `only ${able} here ${able === 1 ? 'gives' : 'give'} it`}. Add one in Staff.`;
}

export type ConsultationSlot = { date: string; start_time: string; duration_minutes: number; therapy_id: string; staff_id: string; staff_name: string; room_id: string; room_name: string };

/**
 * The next free consultation for someone about to arrive (#285 story 4): a
 * doctor and a room, from `fromISO` on, at times the guard accepts. The
 * patient does not exist yet, so nothing of theirs can clash.
 */
/** Why a new resident has no consultation to book, when the cause is the set-up and not a busy doctor. */
export async function whyNoConsultation(prisma: PrismaClient): Promise<string | undefined> {
  const therapy = await prisma.therapy.findFirst({ where: { is_consultation: true } });
  if (!therapy) return 'Add Consultation from the therapy library to book doctor visits.';
  if (!(await prisma.staff.count({ where: { is_active: true, role: 'doctor' } }))) return 'Add a doctor in Staff to book consultations.';
  const rooms = await prisma.therapyRoom.findMany({ where: { is_active: true } });
  if (!rooms.some((r) => therapy.required_amenities.every((a) => r.amenities.includes(a)))) return `No room is set up for consultations. Add a room that has ${therapy.required_amenities.map((a) => a.replace(/_/g, ' ')).join(' and ')}.`;
  return undefined;
}

export async function nextConsultations(fromISO: string, nowMinutes: number | null, prisma: PrismaClient, limit = 5): Promise<ConsultationSlot[]> {
  const therapy = await prisma.therapy.findFirst({ where: { is_consultation: true } });
  if (!therapy) return [];
  // ponytail: a week ahead; a centre with no free doctor for a week can book by hand.
  for (let d = 0; d < 7; d++) {
    const day = new Date(Date.parse(`${fromISO}T00:00:00.000Z`) + d * DAY_MS);
    const ctx = await loadDay(day, prisma);
    const doctors = ctx.staff.filter((s) => s.is_active && s.role === 'doctor');
    const rooms = ctx.rooms.filter((r) => r.is_active);
    const open = toM(ctx.settings?.opening_time || '09:00');
    const close = toM(ctx.settings?.closing_time || '18:00');
    const out: ConsultationSlot[] = [];
    for (let t = Math.ceil(Math.max(open, d === 0 ? nowMinutes ?? open : open) / 15) * 15; t + therapy.duration_minutes <= close && out.length < limit; t += 15) {
      const fit = doctors.flatMap((s) => rooms.map((r) => ({ s, r }))).find(({ s, r }) =>
        works(s.weekly_schedule, day, t, therapy.duration_minutes) && works(r.weekly_schedule, day, t, therapy.duration_minutes)
        && !findConflict({ scheduled_date: day, start_time: hm(t), duration_minutes: therapy.duration_minutes, staff_id: s.id, co_staff_ids: [], room_id: r.id, patient_id: '', therapy_id: therapy.id }, ctx));
      if (fit) out.push({ date: day.toISOString().slice(0, 10), start_time: hm(t), duration_minutes: therapy.duration_minutes, therapy_id: therapy.id, staff_id: fit.s.id, staff_name: fit.s.name, room_id: fit.r.id, room_name: fit.r.name });
    }
    if (out.length) return out;
  }
  return [];
}

/* ------------------------------ Story 14: plan next week (#354) ------------------------------ */

export type WeekSession = { date: string; start_time: string; duration_minutes: number; staff_id: string; co_staff_ids: string[]; room_id: string };
export type WeekLine = { from_therapy_id: string; therapy_id: string; therapy_name: string; start_time: string; staff_name: string; sessions: WeekSession[]; missing: { date: string; why: string }[] };
export type WeekPlan = { from: string; to: string; brief: string | null; lines: WeekLine[]; review: (WeekSession & { therapy_id: string; staff_name: string }) | null; review_missing?: string };

const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const shift = (iso: string, n: number) => isoOf(new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS));

/**
 * Next week from the review day: this week's therapies (the seven days up to the
 * review) repeated on the same weekdays, each at its time and with its therapist
 * where the guard allows, else the nearest free time. `swaps` replaces a line's
 * therapy; `only` keeps just the ticked lines. Proposing and booking both call
 * this, so the sheet never shows what Book all would refuse.
 */
export async function planNextWeek(patientId: string, reviewISO: string, prisma: PrismaClient, opts: { swaps?: Record<string, string>; only?: string[]; review?: boolean } = {}): Promise<WeekPlan | null> {
  const review = new Date(`${reviewISO}T00:00:00.000Z`);
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return null;
  const stay = await prisma.patientStay.findFirst({ where: { patient_id: patientId, start_date: { lte: review }, end_date: { gte: review } } });
  // The leaving day is left empty: patients go in the morning, and the card already marks it.
  const last = stay ? shift(isoOf(stay.end_date), -1) : reviewISO;
  const to = shift(reviewISO, 7) < last ? shift(reviewISO, 7) : last;
  const past = await prisma.appointment.findMany({
    where: { patient_id: patientId, scheduled_date: { gte: new Date(`${shift(reviewISO, -6)}T00:00:00.000Z`), lte: review }, ...HAPPENING },
    include: { Therapy: true }, orderBy: [{ scheduled_date: 'asc' }, { start_time: 'asc' }],
  });
  const therapies = await prisma.therapy.findMany();
  const staffAll = await prisma.staff.findMany();
  const nameOfStaff = (id: string, co: string[]) => [id, ...co].map((x) => staffAll.find((s) => s.id === x)?.name).filter(Boolean).join(' and ');
  // A line per therapy, as last given; its days are this week's weekdays a week on.
  const byTherapy = new Map<string, { last: (typeof past)[number]; dates: Set<string> }>();
  // Snehapana prepares for the stay's purification (#375): never proposed on or after its day.
  const purge = await prisma.appointment.findFirst({ where: { patient_id: patientId, ...HAPPENING, Therapy: { once_per_course: true }, ...(stay ? { scheduled_date: { gte: stay.start_date, lte: stay.end_date } } : {}) }, orderBy: { scheduled_date: 'asc' } });
  const purgeISO = purge ? isoOf(purge.scheduled_date) : null;
  for (const a of past) {
    // A consultation is the review line below; a once-a-course therapy is not repeated (#365).
    if (a.Therapy?.is_consultation || a.Therapy?.once_per_course) continue;
    if (a.Therapy?.before_purification && purgeISO && shift(isoOf(a.scheduled_date), 7) >= purgeISO) continue;
    const e = byTherapy.get(a.therapy_id) || { last: a, dates: new Set<string>() };
    e.last = a; e.dates.add(shift(isoOf(a.scheduled_date), 7));
    byTherapy.set(a.therapy_id, e);
  }
  const consult = [...past].reverse().find((a) => a.Therapy?.is_consultation);
  // Never a day already gone: a review planned late fills only what is left of the week.
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: settings?.timezone || 'Asia/Kolkata' }).format(new Date());
  const first = shift(reviewISO, 1) > today ? shift(reviewISO, 1) : today;
  type Pref = { staff_id: string | null; room_id: string | null };
  const lines = [...byTherapy.entries()]
    .filter(([id]) => !opts.only || opts.only.includes(id))
    .map(([id, e]) => {
      const t = therapies.find((x) => x.id === (opts.swaps?.[id] || id))!;
      return { from_therapy_id: id, therapy_id: t.id, therapy_name: t.name, start_time: e.last.start_time, staff_name: '', sessions: [], missing: [], _pref: e.last as Pref, _dates: [...e.dates].filter((d) => d > reviewISO && d <= to) };
    })
    // A therapy ticked that this week never had (a patient's first days, #611): every day of the week, from the centre's opening time.
    .concat((opts.only || []).filter((id) => !byTherapy.has(id) && therapies.some((t) => t.id === (opts.swaps?.[id] || id) && !t.is_consultation)).map((id) => {
      const t = therapies.find((x) => x.id === (opts.swaps?.[id] || id))!;
      const days: string[] = [];
      for (let d = first; d <= to; d = shift(d, 1)) days.push(d);
      return { from_therapy_id: id, therapy_id: t.id, therapy_name: t.name, start_time: settings?.opening_time || '09:00', staff_name: '', sessions: [], missing: [], _pref: { staff_id: null, room_id: null } as Pref, _dates: days };
    }))
    .sort((a, b) => a.start_time.localeCompare(b.start_time)) as (WeekLine & { _pref: Pref; _dates: string[] })[];
  let reviewOut: WeekPlan['review'] = null;
  let reviewMissing: string | undefined;
  const reviewDate = shift(reviewISO, 7);
  const wantReview = opts.review !== false && !!consult && reviewDate <= last;
  // Day by day, each placement added to the day before the next is tried, so two lines never take the same minute.
  for (let d = first; d <= reviewDate && d <= last; d = shift(d, 1)) {
    const day = new Date(`${d}T00:00:00.000Z`);
    const ctx = await loadDay(day, prisma);
    const open = toM(ctx.settings?.opening_time || '09:00');
    const close = toM(ctx.settings?.closing_time || '18:00');
    const place = (therapyId: string, at: string, pref: { staff_id: string | null; room_id: string | null }) => {
      const therapy = ctx.therapies.find((x) => x.id === therapyId)!;
      const t0 = toM(at);
      // The usual time first, then outward a quarter hour at a time.
      for (let k = 0; k <= (close - open) / 15; k++) for (const t of k ? [t0 + 15 * k, t0 - 15 * k] : [t0]) {
        if (t < open || t + therapy.duration_minutes > close) continue;
        const a = assign(ctx, day, t, therapy, patientId, { staff_id: pref.staff_id || undefined, room_id: pref.room_id || undefined });
        if (!a) continue;
        ctx.appointments.push({ id: `new-${ctx.appointments.length}`, patient_id: patientId, therapy_id: therapy.id, scheduled_date: day, start_time: a.start_time, duration_minutes: a.duration_minutes, staff_id: a.staff_id, co_staff_ids: a.co_staff_ids, room_id: a.room_id, status: 'confirmed' } as (typeof ctx.appointments)[number]);
        return a;
      }
      return null;
    };
    if (wantReview && d === reviewDate && !ctx.appointments.some((a) => a.patient_id === patientId && a.therapy_id === consult!.therapy_id)) {
      const a = place(consult!.therapy_id, consult!.start_time, consult!);
      if (a) reviewOut = { date: d, therapy_id: a.therapy_id, start_time: a.start_time, duration_minutes: a.duration_minutes, staff_id: a.staff_id, co_staff_ids: a.co_staff_ids, room_id: a.room_id, staff_name: a.staff_name };
      else reviewMissing = 'No doctor is free that day';
    }
    for (const l of lines) {
      if (!l._dates.includes(d)) continue;
      // Already booked that day (planned by hand, or by an earlier Book all): left as it is.
      if (ctx.appointments.some((a) => a.patient_id === patientId && a.therapy_id === l.therapy_id)) continue;
      const a = place(l.therapy_id, l.start_time, l._pref);
      if (a) l.sessions.push({ date: d, start_time: a.start_time, duration_minutes: a.duration_minutes, staff_id: a.staff_id, co_staff_ids: a.co_staff_ids, room_id: a.room_id });
      else l.missing.push({ date: d, why: 'No therapist or room is free that day' });
    }
  }
  return {
    from: first, to, brief: patient.doctor_plan ?? null, review: reviewOut, review_missing: wantReview ? reviewMissing : undefined,
    lines: lines.map(({ _pref, _dates, ...l }) => ({ ...l, start_time: l.sessions[0]?.start_time || l.start_time, staff_name: l.sessions[0] ? nameOfStaff(l.sessions[0].staff_id, l.sessions[0].co_staff_ids) : nameOfStaff(_pref.staff_id || '', []) })),
  };
}
