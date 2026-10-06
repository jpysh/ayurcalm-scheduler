/**
 * Team, read by day (#219, #351): who works each day of a week, their hours, who
 * is away and why, and the minutes booked against the minutes they are in.
 * Read through loadDay and offOnDay, so leave counts here exactly as the guard counts it.
 */
import type { PrismaClient } from '@prisma/client';
import { loadDay } from './appointmentGuard.js';
import { offOnDay, teamOf, toMinutes } from './availability.js';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
type Hours = { start: string; end: string } | null | undefined;

export async function staffWeek(start: string, prisma: PrismaClient) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000));
  const ctxs = await Promise.all(days.map((d) => loadDay(d, prisma)));
  const staff = ctxs[0].staff.filter((s) => s.is_active).sort((a, b) => a.name.localeCompare(b.name));
  const rows = staff.map((s) => {
    // One entry a day (#351): their hours, why they are away, and the minutes booked against the minutes in.
    const days7 = ctxs.map((ctx, i) => {
      // Hours never set count as 09:00-18:00 every day, as the scheduler reads them; a week set by hand keeps its days off.
      const sched = s.weekly_schedule as Record<string, Hours> | null;
      const hours = sched && Object.keys(sched).length ? sched[WEEKDAYS[days[i].getUTCDay()]] : { start: '09:00', end: '18:00' };
      if (!hours?.start || !hours?.end) return { state: 'off' as const, booked: 0, capacity: 0 };
      const open = toMinutes(hours.start), close = toMinutes(hours.end);
      const offs = offOnDay(ctx.timeOff, 'staff', s.id, ctx.day);
      const whole = offs.find((o) => o.whole);
      if (whole) return { state: 'away' as const, start: hours.start, end: hours.end, why: whole.label, booked: 0, capacity: 0 };
      const out = offs.reduce((n, o) => n + Math.max(0, Math.min(close, o.e) - Math.max(open, o.s)), 0);
      const booked = ctx.appointments.filter((a) => teamOf(a).includes(s.id)).reduce((n, a) => n + a.duration_minutes, 0);
      return { state: out ? ('part' as const) : ('in' as const), start: hours.start, end: hours.end, ...(out ? { why: offs[0].label } : {}), booked, capacity: close - open - out };
    });
    return { id: s.id, name: s.name, role: s.role, days: days7 };
  });
  return { start, days: days.map((d) => d.toISOString().slice(0, 10)), rows };
}
