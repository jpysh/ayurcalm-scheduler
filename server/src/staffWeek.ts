/**
 * Team, read by day (#219, #351): who works each day of a week, their hours, who
 * is away and why, and the minutes booked against the minutes they are in.
 * Read through loadDay and offOnDay, so leave counts here exactly as the guard counts it.
 */
import type { PrismaClient } from '@prisma/client';
import { loadDay } from './appointmentGuard.js';
import { hoursOn, offOnDay, teamOf, toMinutes } from './availability.js';


export async function staffWeek(start: string, prisma: PrismaClient) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000));
  const ctxs = await Promise.all(days.map((d) => loadDay(d, prisma)));
  const staff = ctxs[0].staff.filter((s) => s.is_active).sort((a, b) => a.name.localeCompare(b.name));
  const rows = staff.map((s) => {
    // One entry a day (#351): their hours, why they are away, and the minutes booked against the minutes in.
    const days7 = ctxs.map((ctx, i) => {
      // Hours never set are the centre's hours, as the guard reads them; a week set by hand keeps its days off.
      const h = hoursOn(s.weekly_schedule, days[i]);
      if (h === null) return { state: 'off' as const, booked: 0, capacity: 0 };
      const hours = h ? { start: hm(h.s), end: hm(h.e) } : { start: ctx.settings?.opening_time || '09:00', end: ctx.settings?.closing_time || '18:00' };
      const open = toMinutes(hours.start), close = toMinutes(hours.end);
      const offs = offOnDay(ctx.timeOff, 'staff', s.id, ctx.day);
      // Time off over all their hours is the whole day, whatever hours it was given (#704).
      const whole = offs.find((o) => o.whole || (o.s <= open && o.e >= close));
      if (whole) return { state: 'away' as const, start: hours.start, end: hours.end, why: whole.label, booked: 0, capacity: 0 };
      const out = offs.reduce((n, o) => n + Math.max(0, Math.min(close, o.e) - Math.max(open, o.s)), 0);
      const booked = ctx.appointments.filter((a) => teamOf(a).includes(s.id)).reduce((n, a) => n + a.duration_minutes, 0);
      // In late or leaving early narrows the hours shown, so "09:00–15:00" and "of 6h" agree (#570).
      let from = open, to = close;
      for (const o of [...offs].sort((a, b) => a.s - b.s)) if (o.s <= from && o.e > from) from = o.e;
      for (const o of [...offs].sort((a, b) => b.e - a.e)) if (o.e >= to && o.s < to) to = o.s;
      return { state: out ? ('part' as const) : ('in' as const), start: hm(Math.min(from, to)), end: hm(to), ...(out ? { why: offs[0].label } : {}), booked, capacity: close - open - out };
    });
    return { id: s.id, name: s.name, role: s.role, days: days7 };
  });
  // Rooms by the same pass (#573): the minutes booked in each against the minutes it is open.
  const rooms = ctxs[0].rooms.filter((r) => r.is_active).map((r) => ({ id: r.id, days: ctxs.map((ctx, i) => {
    const h = hoursOn(r.weekly_schedule, days[i]);
    if (h === null) return { booked: 0, capacity: 0 };
    const open = h ? h.s : toMinutes(ctx.settings?.opening_time || '09:00'), close = h ? h.e : toMinutes(ctx.settings?.closing_time || '18:00');
    const offs = offOnDay(ctx.timeOff, 'room', r.id, ctx.day);
    const out = offs.some((o) => o.whole) ? close - open : offs.reduce((n, o) => n + Math.max(0, Math.min(close, o.e) - Math.max(open, o.s)), 0);
    const booked = ctx.appointments.filter((a) => a.room_id === r.id).reduce((n, a) => n + a.duration_minutes, 0);
    return { booked, capacity: close - open - out };
  }) }));
  return { start, days: days.map((d) => d.toISOString().slice(0, 10)), rows, rooms, gaps: ctxs.map((ctx, i) => gapsOn(ctx, rows, i)) };
}

/** Fewer than this many therapists in for an hour is a gap (#351; decided by Claude, to confirm): one in cannot cover a two-therapist therapy or a swap. */
const FEWEST = 2;
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** The centre's opening hours on day i, an hour at a time, merged into runs that have the same too-few count: "18:00–20:00 · 1 in". */
function gapsOn(ctx: Awaited<ReturnType<typeof loadDay>>, rows: { id: string; role: string; days: { state: string; start?: string; end?: string }[] }[], i: number) {
  const open = toMinutes(ctx.settings?.opening_time || '09:00'), close = toMinutes(ctx.settings?.closing_time || '18:00');
  const therapists = rows.filter((r) => r.role !== 'doctor');
  const out: { start: string; end: string; in: number }[] = [];
  for (let h = open; h < close; h += 60) {
    const e = Math.min(h + 60, close);
    const n = therapists.filter((r) => {
      const d = r.days[i];
      if ((d.state !== 'in' && d.state !== 'part') || toMinutes(d.start!) > h || toMinutes(d.end!) < e) return false;
      return !offOnDay(ctx.timeOff, 'staff', r.id, ctx.day).some((o) => o.s < e && o.e > h);
    }).length;
    if (n >= FEWEST) continue;
    const last = out[out.length - 1];
    if (last && last.end === hm(h) && last.in === n) last.end = hm(e);
    else out.push({ start: hm(h), end: hm(e), in: n });
  }
  return out;
}
