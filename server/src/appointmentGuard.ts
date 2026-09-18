/**
 * Whether one appointment can sit where it is being put.
 *
 * The booking path has checked this for a long time; editing one did not. The
 * dialog checked in the browser and `PUT /appointments/:id` took whatever it
 * was sent, so any rule could be walked around by dragging a treatment. This is
 * that check, on the server, where it cannot be skipped.
 */
import { PrismaClient } from '@prisma/client';
import { overlaps, staffEventBusy, teamOf, toMinutes, type EventRow } from './availability.js';

export type Conflict = { reason: string; message: string; details?: Record<string, unknown> };

export type Candidate = {
  id?: string;
  scheduled_date: Date;
  start_time: string;
  duration_minutes: number;
  staff_id: string | null;
  co_staff_ids?: string[];
  room_id: string | null;
  patient_id: string;
  therapy_id?: string;
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
  const [appointments, timeOff, events, staff, rooms, settings, patients, therapies] = await Promise.all([
    prisma.appointment.findMany({ where: { scheduled_date: day, status: { not: 'cancelled' } } }),
    prisma.timeOff.findMany(),
    prisma.programEvent.findMany() as unknown as Promise<EventRow[]>,
    prisma.staff.findMany(),
    prisma.therapyRoom.findMany(),
    prisma.settings.findUnique({ where: { id: 'singleton' } }),
    prisma.patient.findMany(),
    prisma.therapy.findMany(),
  ]);
  return { day, appointments, timeOff, events, staff, rooms, settings, patients, therapies };
}

export type DayContext = Awaited<ReturnType<typeof loadDay>>;

export function findConflict(c: Candidate, ctx: DayContext): Conflict | null {
  const start = toMinutes(c.start_time);
  const end = start + c.duration_minutes;
  const others = ctx.appointments.filter((a) => a.id !== c.id);
  const hits = (a: { start_time: string; duration_minutes: number }) =>
    overlaps(toMinutes(a.start_time), toMinutes(a.start_time) + a.duration_minutes, start, end);

  // Everyone on the treatment is checked, lead or not: a co-therapist is in the
  // room, and cannot be anywhere else.
  const team = teamOf(c);
  for (const staffId of team) {
    const name = ctx.staff.find((s) => s.id === staffId)?.name || 'That therapist';

    const clash = others.find((a) => teamOf(a).includes(staffId) && hits(a));
    if (clash) {
      return { reason: 'STAFF_BUSY', message: `${name} already has a treatment at ${clash.start_time}.`, details: { start_time: clash.start_time, staff_id: staffId } };
    }

    const off = ctx.timeOff.find((h) => h.entity_type === 'staff' && h.entity_id === staffId && hitsDay(h, ctx.day));
    if (off) {
      return { reason: 'STAFF_OFF', message: `${name} is not in on this day (${off.description || 'time off'}).`, details: { staff_id: staffId } };
    }

    const inEvent = staffEventBusy(ctx.events, staffId, ctx.day).find((b) => overlaps(b.s, b.e, start, end));
    if (inEvent) {
      return {
        reason: 'STAFF_IN_EVENT',
        message: `${name} is running ${inEvent.label} from ${minutesToTime(inEvent.s)} to ${minutesToTime(inEvent.e)}.`,
        details: { staff_id: staffId, activity_name: inEvent.label, event_start: minutesToTime(inEvent.s), event_end: minutesToTime(inEvent.e) },
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

  const therapy = c.therapy_id ? ctx.therapies.find((t) => t.id === c.therapy_id) : undefined;
  const patient = ctx.patients.find((p) => p.id === c.patient_id);

  // A therapy that needs a therapist of the resident's own gender, where the
  // centre has left that rule switched on. The scheduler has always avoided
  // proposing these; nothing refused one that arrived another way.
  if (therapy?.requires_gender_match && ctx.settings?.enforce_gender_match !== false) {
    const s = ctx.staff.find((x) => team.includes(x.id) && patient && x.gender !== patient.gender);
    if (s) {
      return {
        reason: 'GENDER_MISMATCH',
        message: `${therapy.name} is given by therapists of the resident's own gender, and ${s.name} is not.`,
        details: { staff_id: s.id },
      };
    }
  }

  // A treatment short of hands does not happen. No one at all is a different
  // problem (Verify's "no therapist"), so that is left to it.
  const needed = therapy?.staff_required ?? 1;
  if (team.length > 0 && team.length < needed) {
    return {
      reason: 'STAFF_SHORT',
      message: `${therapy!.name} needs ${needed} therapists and has ${team.length}.`,
      details: { needed, has: team.length },
    };
  }

  // The room has to have what the treatment is done with. A Pizhichil without a
  // droni is not an awkward booking, it is one that cannot happen.
  if (therapy && c.room_id) {
    const room = ctx.rooms.find((r) => r.id === c.room_id);
    const missing = (therapy.required_amenities || []).filter((a) => !(room?.amenities || []).includes(a));
    if (room && missing.length > 0) {
      return {
        reason: 'AMENITIES_MISSING',
        message: `${room.name} has no ${missing.join(' or ')}, which ${therapy.name} needs.`,
        details: { missing },
      };
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

/**
 * Each therapist's day as the guard sees it: on leave, or the times they are
 * tied up running an event or giving a treatment. The schedule's "who is free
 * at 11:00" reads this, so it can never call someone free whom a booking
 * would refuse.
 */
export function staffDay(ctx: DayContext) {
  return ctx.staff.filter((s) => s.is_active).map((s) => {
    const off = ctx.timeOff.find((h) => h.entity_type === 'staff' && h.entity_id === s.id && hitsDay(h, ctx.day));
    const busy = [
      ...staffEventBusy(ctx.events, s.id, ctx.day),
      ...ctx.appointments.filter((a) => teamOf(a).includes(s.id))
        .map((a) => ({ s: toMinutes(a.start_time), e: toMinutes(a.start_time) + a.duration_minutes, label: 'treatment' })),
    ].sort((a, b) => a.s - b.s);
    return { staff_id: s.id, off: off ? (off.description || 'time off') : null, busy };
  });
}
