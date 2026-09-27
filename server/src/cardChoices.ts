/**
 * The treatment card's lists (#136): for one treatment, the times, therapists,
 * rooms and treatments it could change to. Every option is put through the same
 * guard a booking goes through, so the card never offers what a save would
 * refuse. The browser only shows these.
 */
import type { PrismaClient } from '@prisma/client';
import { findConflict, loadDay, type Candidate } from './appointmentGuard.js';

export type Kind = 'time' | 'staff' | 'room' | 'therapy';
export type Choice = { label: string; hint?: string; best?: boolean; change: Record<string, unknown> };

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

  if (kind === 'time') {
    // Later the same day, same therapist and room: what "running late" and
    // "move" need most. From now on today, never into the past.
    const open = toM(ctx.settings?.opening_time || '09:00');
    const close = toM(ctx.settings?.closing_time || '18:00');
    const from = Math.max(open, nowMinutes ?? open);
    for (let t = Math.ceil(from / 15) * 15; t + a.duration_minutes <= close && out.length < MAX; t += 15) {
      if (t === toM(a.start_time)) continue;
      const team = ctx.staff.filter((x) => x.id === a.staff_id || a.co_staff_ids.includes(x.id));
      const room = ctx.rooms.find((x) => x.id === a.room_id);
      if (!team.every((x) => works(x.weekly_schedule, a.scheduled_date, t, a.duration_minutes)) || (room && !works(room.weekly_schedule, a.scheduled_date, t, a.duration_minutes))) continue;
      if (fits({ start_time: hm(t) })) {
        const diff = t - toM(a.start_time);
        out.push({ label: `${hm(t)} to ${hm(t + a.duration_minutes)}`, hint: diff > 0 ? `+${diff} min` : `${diff} min`, best: out.length === 0, change: { start_time: hm(t) } });
      }
    }
    return out;
  }

  if (kind === 'staff') {
    for (const s of ctx.staff) {
      if (!s.is_active || s.id === a.staff_id || a.co_staff_ids.includes(s.id)) continue;
      // Only someone trained for it, when the centre has said who is.
      if (s.specializations.length && !s.specializations.includes(a.therapy_id)) continue;
      if (!works(s.weekly_schedule, a.scheduled_date, toM(a.start_time), a.duration_minutes)) continue;
      if (fits({ staff_id: s.id })) out.push({ label: s.name, best: out.length === 0, change: { staff_id: s.id } });
      if (out.length >= MAX) break;
    }
    return out;
  }

  if (kind === 'room') {
    for (const r of ctx.rooms) {
      if (!r.is_active || r.id === a.room_id) continue;
      if (!works(r.weekly_schedule, a.scheduled_date, toM(a.start_time), a.duration_minutes)) continue;
      if (fits({ room_id: r.id })) out.push({ label: r.name, best: out.length === 0, change: { room_id: r.id } });
      if (out.length >= MAX) break;
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
    if (out.length >= MAX) break;
  }
  return out;
}

export type Suggestion = {
  patient_id: string; patient_name: string; therapy_id: string; therapy_name: string;
  start_time: string; duration_minutes: number; staff_id: string; staff_name: string; room_id: string; room_name: string;
};

/**
 * Who to book next from the + button (#136): residents in house with the
 * fewest treatments so far in their stay, each with their own therapy (the one
 * they had last) at its first time from now that the guard accepts.
 */
export async function bookingSuggestions(dayISO: string, nowMinutes: number | null, prisma: PrismaClient, limit = 3): Promise<Suggestion[]> {
  const day = new Date(`${dayISO}T00:00:00.000Z`);
  const ctx = await loadDay(day, prisma);
  const stays = await prisma.patientStay.findMany({ where: { start_date: { lte: day }, end_date: { gte: day } } });
  const ids = stays.map((s) => s.patient_id);
  const history = await prisma.appointment.findMany({
    where: { patient_id: { in: ids }, status: { notIn: ['cancelled', 'no_show'] } },
    orderBy: { scheduled_date: 'desc' },
    select: { patient_id: true, therapy_id: true, scheduled_date: true },
  });
  const ranked = stays
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
        if (findConflict(c, ctx)) continue;
        const p = ctx.patients.find((x) => x.id === r.stay.patient_id);
        out.push({ patient_id: c.patient_id, patient_name: p?.name || '', therapy_id: therapy.id, therapy_name: therapy.name, start_time: c.start_time, duration_minutes: c.duration_minutes, staff_id: s.id, staff_name: s.name, room_id: room.id, room_name: room.name });
        break search;
      }
    }
    if (out.length >= limit) break;
  }
  return out;
}
