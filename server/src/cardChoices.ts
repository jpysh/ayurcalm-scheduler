/**
 * The treatment card's lists (#136): for one treatment, the times, therapists,
 * rooms and treatments it could change to. Every option is put through the same
 * guard a booking goes through, so the card never offers what a save would
 * refuse. The browser only shows these.
 */
import type { PrismaClient } from '@prisma/client';
import { findConflict, loadDay, type Candidate } from './appointmentGuard.js';

export type Kind = 'time' | 'staff' | 'room' | 'therapy';
/** `now` marks the treatment as it stands, listed first so the admin sees what they change from (#201). */
export type Choice = { label: string; hint?: string; best?: boolean; now?: boolean; change: Record<string, unknown> };

const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
/** Inside a therapist's or room's weekly hours, read as the scheduler reads them (09:00–18:00 when unset). */
const works = (weekly: unknown, day: Date, start: number, minutes: number) => {
  const d = (weekly as Record<string, { start?: unknown; end?: unknown }> | null)?.[WEEKDAYS[day.getUTCDay()]];
  const [s, e] = typeof d?.start === 'string' && typeof d?.end === 'string' ? [toM(d.start), toM(d.end)] : [9 * 60, 18 * 60];
  return start >= s && start + minutes <= e;
};

/** How many rows a list shows: enough to choose, few enough to read on a phone. */
const MAX = 5;
const DAY_MS = 86400000;
/** "Tue 29 Sep", for an option on another day. */
const dayLabel = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

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
    for (const s of ctx.staff) {
      if (!s.is_active || s.id === a.staff_id || a.co_staff_ids.includes(s.id)) continue;
      // Only someone trained for it, when the centre has said who is.
      if (s.specializations.length && !s.specializations.includes(a.therapy_id)) continue;
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
      return !s || !s.specializations.length || s.specializations.includes(t.id);
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
    const staff = ctx.staff.filter((s) => s.is_active && (!s.specializations.length || s.specializations.includes(therapy.id)));
    const rooms = ctx.rooms.filter((x) => x.is_active);
    // ponytail: first fit by time, then therapist, then room; the planner's scoring if a centre asks for better.
    search: for (let t = from; t + therapy.duration_minutes <= close; t += 15) {
      for (const s of staff) for (const room of rooms) {
        if (!works(s.weekly_schedule, day, t, therapy.duration_minutes) || !works(room.weekly_schedule, day, t, therapy.duration_minutes)) continue;
        const c: Candidate = { scheduled_date: day, start_time: hm(t), duration_minutes: therapy.duration_minutes, staff_id: s.id, co_staff_ids: [], room_id: room.id, patient_id: r.stay.patient_id, therapy_id: therapy.id };
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
        const p = ctx.patients.find((x) => x.id === r.stay.patient_id);
        out.push({ patient_id: c.patient_id, patient_name: p?.name || '', therapy_id: therapy.id, therapy_name: therapy.name, start_time: c.start_time, duration_minutes: c.duration_minutes, staff_id: s.id, staff_name: [s, ...co.map((id) => staff.find((x) => x.id === id)!)].map((x) => x.name).join(' and '), co_staff_ids: co, room_id: room.id, room_name: room.name });
        if (!pick || out.length >= limit) break search;
        continue search;
      }
    }
    if (out.length >= limit) break;
  }
  return out;
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
  const able = ctx.staff.filter((s) => s.is_active && (!s.specializations.length || s.specializations.includes(therapy.id)) && (!sameGender || s.gender === patient.gender)).length;
  const needed = therapy.staff_required ?? 1;
  if (able >= needed) return undefined;
  const who = `${needed === 1 ? 'a therapist' : `${needed} therapists together`}${sameGender ? ` of ${patient.name.split(' ')[0]}'s gender` : ''}`;
  return `${therapy.name} needs ${who}, and ${able === 0 ? 'nobody here gives it yet' : `only ${able} here ${able === 1 ? 'gives' : 'give'} it`}. Add one in Team and rooms.`;
}
