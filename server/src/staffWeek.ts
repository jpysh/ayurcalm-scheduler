/**
 * Team → This week (#219): who works each day of a week, who is away, and the
 * hours booked against the hours they are in. Macro only: the day screens say
 * what; this says how full. Read through loadDay and offOnDay, so leave counts
 * here exactly as the guard counts it.
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
    let capacity = 0;
    let booked = 0;
    const week = ctxs.map((ctx, i) => {
      const hours = (s.weekly_schedule as Record<string, Hours>)?.[WEEKDAYS[days[i].getUTCDay()]];
      if (!hours?.start || !hours?.end) return 'off' as const;
      const open = toMinutes(hours.start), close = toMinutes(hours.end);
      const offs = offOnDay(ctx.timeOff, 'staff', s.id, ctx.day);
      if (offs.some((o) => o.whole)) return 'away' as const;
      const out = offs.reduce((n, o) => n + Math.max(0, Math.min(close, o.e) - Math.max(open, o.s)), 0);
      capacity += close - open - out;
      booked += ctx.appointments.filter((a) => teamOf(a).includes(s.id)).reduce((n, a) => n + a.duration_minutes, 0);
      return out ? ('part' as const) : ('in' as const);
    });
    return { id: s.id, name: s.name, role: s.role, week, booked, capacity };
  });
  return { start, days: days.map((d) => d.toISOString().slice(0, 10)), rows };
}
