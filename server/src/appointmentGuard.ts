/**
 * Whether one appointment can sit where it is being put.
 *
 * The booking path has checked this for a long time; editing one did not. The
 * dialog checked in the browser and `PUT /appointments/:id` took whatever it
 * was sent, so any rule could be walked around by dragging a treatment. This is
 * that check, on the server, where it cannot be skipped.
 */
import { PrismaClient } from '@prisma/client';
import { overlaps, staffEventBusy, toMinutes, type EventRow } from './availability.js';

export type Conflict = { reason: string; message: string; details?: Record<string, unknown> };

export type Candidate = {
  id?: string;
  scheduled_date: Date;
  start_time: string;
  duration_minutes: number;
  staff_id: string | null;
  room_id: string | null;
  patient_id: string;
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const hitsDay = (
  h: { date: Date | null; start_date: Date | null; end_date: Date | null; recurrence: string | null; weekdays: string[] },
  day: Date,
) => {
  if (h.date && h.date.toDateString() === day.toDateString()) return true;
  if (h.start_date && h.end_date && h.start_date <= day && h.end_date >= day) return true;
  if (h.recurrence === 'weekly' && Array.isArray(h.weekdays) && h.weekdays.includes(WEEKDAYS[day.getDay()])) return true;
  return false;
};

/** Everything a day's worth of checks needs, read once. */
export async function loadDay(day: Date, prisma: PrismaClient) {
  const [appointments, timeOff, events, staff, rooms, settings] = await Promise.all([
    prisma.appointment.findMany({ where: { scheduled_date: day, status: { not: 'cancelled' } } }),
    prisma.timeOff.findMany(),
    prisma.programEvent.findMany() as unknown as Promise<EventRow[]>,
    prisma.staff.findMany(),
    prisma.therapyRoom.findMany(),
    prisma.settings.findUnique({ where: { id: 'singleton' } }),
  ]);
  return { day, appointments, timeOff, events, staff, rooms, settings };
}

export type DayContext = Awaited<ReturnType<typeof loadDay>>;

export function findConflict(c: Candidate, ctx: DayContext): Conflict | null {
  const start = toMinutes(c.start_time);
  const end = start + c.duration_minutes;
  const others = ctx.appointments.filter((a) => a.id !== c.id);
  const hits = (a: { start_time: string; duration_minutes: number }) =>
    overlaps(toMinutes(a.start_time), toMinutes(a.start_time) + a.duration_minutes, start, end);

  if (c.staff_id) {
    const name = ctx.staff.find((s) => s.id === c.staff_id)?.name || 'That therapist';

    const clash = others.find((a) => a.staff_id === c.staff_id && hits(a));
    if (clash) {
      return { reason: 'STAFF_BUSY', message: `${name} already has a treatment at ${clash.start_time}.`, details: { start_time: clash.start_time } };
    }

    const off = ctx.timeOff.find((h) => h.entity_type === 'staff' && h.entity_id === c.staff_id && hitsDay(h, ctx.day));
    if (off) {
      return { reason: 'STAFF_OFF', message: `${name} is not in on this day (${off.description || 'time off'}).` };
    }

    const inEvent = staffEventBusy(ctx.events, c.staff_id, ctx.day).find((b) => overlaps(b.s, b.e, start, end));
    if (inEvent) {
      return {
        reason: 'STAFF_IN_EVENT',
        message: `${name} is running ${inEvent.label} from ${minutesToTime(inEvent.s)} to ${minutesToTime(inEvent.e)}.`,
        details: { activity_name: inEvent.label, event_start: minutesToTime(inEvent.s), event_end: minutesToTime(inEvent.e) },
      };
    }
  }

  if (c.room_id) {
    const clash = others.find((a) => a.room_id === c.room_id && hits(a));
    if (clash) {
      const room = ctx.rooms.find((r) => r.id === c.room_id);
      return { reason: 'ROOM_BUSY', message: `${room?.name || 'That room'} is in use at ${clash.start_time}.`, details: { start_time: clash.start_time } };
    }
  }

  const patientClash = others.find((a) => a.patient_id === c.patient_id && hits(a));
  if (patientClash) {
    return { reason: 'PATIENT_BUSY', message: `This resident already has a treatment at ${patientClash.start_time}.`, details: { start_time: patientClash.start_time } };
  }

  return null;
}

/**
 * The nearest start time on the same day where the therapist, the room and the
 * resident are all free. A refusal with nothing to do next is a dead end, and
 * at 8am the admin needs the answer rather than the diagnosis.
 */
export function nearestFreeTime(c: Candidate, ctx: DayContext): string | null {
  const open = toMinutes(ctx.settings?.opening_time || '09:00');
  const close = toMinutes(ctx.settings?.closing_time || '18:00');
  for (let t = open; t + c.duration_minutes <= close; t += 30) {
    const at = minutesToTime(t);
    if (at === c.start_time) continue;
    if (!findConflict({ ...c, start_time: at }, ctx)) return at;
  }
  return null;
}
