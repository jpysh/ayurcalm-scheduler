/**
 * Whether one appointment can sit where it is being put.
 *
 * The booking path has checked this for a long time; editing one did not. The
 * dialog checked in the browser and `PUT /appointments/:id` took whatever it
 * was sent, so any rule could be walked around by dragging a treatment. This is
 * that check, on the server, where it cannot be skipped.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { offOnDay, overlaps, staffEventBusy, teamOf, toMinutes, type EventRow } from './availability.js';

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


const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;


/**
 * The treatments that take a therapist, a room and the resident's time: not
 * cancelled, and not a no-show, whose slot is free again (#136, #161). Every
 * read that decides who is busy uses this, so the guard, the planner and the
 * scheduler cannot disagree about a cancelled slot.
 */
export const HAPPENING: Prisma.AppointmentWhereInput = { status: { notIn: ['cancelled', 'no_show'] } };

/** Everything a day's worth of checks needs, read once. */
export async function loadDay(day: Date, prisma: PrismaClient) {
  const [appointments, timeOff, events, staff, rooms, settings, patients, therapies] = await Promise.all([
    prisma.appointment.findMany({ where: { scheduled_date: day, ...HAPPENING } }),
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

    const off = offOnDay(ctx.timeOff, 'staff', staffId, ctx.day).find((b) => overlaps(b.s, b.e, start, end));
    if (off) {
      const when = off.whole ? 'on this day' : `from ${minutesToTime(off.s)} to ${minutesToTime(off.e)}`;
      return { reason: 'STAFF_OFF', message: `${name} is not in ${when} (${off.label}).`, details: { staff_id: staffId } };
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
    const off = offOnDay(ctx.timeOff, 'room', c.room_id, ctx.day).find((b) => overlaps(b.s, b.e, start, end));
    if (off) {
      const room = ctx.rooms.find((r) => r.id === c.room_id);
      const when = off.whole ? 'on this day' : `from ${minutesToTime(off.s)} to ${minutesToTime(off.e)}`;
      return { reason: 'ROOM_OFF', message: `${room?.name || 'That room'} is out of use ${when} (${off.label}).`, details: { room_id: c.room_id } };
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
        message: `${therapy.name} is given by therapists of the patient's own gender, and ${s.name} is not.`,
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
        message: `${room.name} has no ${missing.map((a) => a.replace(/_/g, ' ')).join(' or ')}, which ${therapy.name} needs.`,
        details: { missing },
      };
    }
  }

  const patientClash = others.find((a) => a.patient_id === c.patient_id && hits(a));
  if (patientClash) {
    return { reason: 'PATIENT_BUSY', message: `This patient already has a treatment at ${patientClash.start_time}.`, details: { start_time: patientClash.start_time } };
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
    const offs = offOnDay(ctx.timeOff, 'staff', s.id, ctx.day);
    const off = offs.find((b) => b.whole);
    const busy = [
      ...offs.filter((b) => !b.whole).map(({ s: from, e, label }) => ({ s: from, e, label })),
      ...staffEventBusy(ctx.events, s.id, ctx.day),
      ...ctx.appointments.filter((a) => teamOf(a).includes(s.id))
        .map((a) => ({ s: toMinutes(a.start_time), e: toMinutes(a.start_time) + a.duration_minutes, label: 'treatment' })),
    ].sort((a, b) => a.s - b.s);
    return { staff_id: s.id, off: off ? off.label : null, busy };
  });
}

/**
 * What the screen offers next to a refusal or a warning (#330). The server
 * decides which; the screen only knows how to carry each kind out. A refusal
 * with no way forward is a dead end.
 */
export type Action = {
  kind: 'book_at' | 'set_date' | 'other_therapy' | 'add_staff' | 'allow_any_gender' | 'change_stay' | 'book_anyway';
  label: string;
  date?: string;
  start_time?: string;
  gender?: string;
  therapy_id?: string;
  patient_id?: string;
};

export type Soft = { reason: 'DAY_FULL' | 'SAME_THERAPY' | 'ONCE_PER_COURSE'; message: string; actions: Action[] };

export const DEFAULT_MAX_PER_DAY = 4;

/**
 * Soft rules: a day with the resident's limit already reached, and the same
 * therapy twice in a day. Asked, never refused: the admin may know better, so
 * the booking goes through with `confirm`. A multi-day course books one a day
 * through another route and is never asked.
 */
export function softWarnings(c: { id?: string; patient_id: string; therapy_id?: string }, ctx: DayContext): Soft[] {
  const mine = ctx.appointments.filter((a) => a.patient_id === c.patient_id && a.id !== c.id);
  const first = (ctx.patients.find((p) => p.id === c.patient_id)?.name || 'They').split(' ')[0];
  const anyway: Action = { kind: 'book_anyway', label: 'Book anyway' };
  const out: Soft[] = [];
  const max = ctx.settings?.max_treatments_per_day ?? DEFAULT_MAX_PER_DAY;
  if (mine.length >= max) out.push({ reason: 'DAY_FULL', message: `${first} already has ${mine.length} treatments that day.`, actions: [anyway] });
  const twin = c.therapy_id ? mine.find((a) => a.therapy_id === c.therapy_id) : undefined;
  if (twin) {
    const name = ctx.therapies.find((t) => t.id === c.therapy_id)?.name.replace(/_/g, ' ') || 'that treatment';
    out.push({ reason: 'SAME_THERAPY', message: `${first} already has ${name} at ${twin.start_time}.`, actions: [anyway] });
  }
  return out;
}

/**
 * A therapy given once a course (Vamana, Virechana) already in this stay (#365):
 * asked, never refused, as the other soft rules are. A day visitor has no stay
 * and is never asked.
 */
export async function oncePerCourse(c: { id?: string; patient_id: string; therapy_id?: string; scheduled_date: Date }, prisma: PrismaClient): Promise<Soft | null> {
  if (!c.therapy_id) return null;
  const therapy = await prisma.therapy.findUnique({ where: { id: c.therapy_id } });
  if (!therapy?.once_per_course) return null;
  const stay = await prisma.patientStay.findFirst({ where: { patient_id: c.patient_id, start_date: { lte: c.scheduled_date }, end_date: { gte: c.scheduled_date } } });
  if (!stay) return null;
  const had = await prisma.appointment.findFirst({
    where: { patient_id: c.patient_id, therapy_id: c.therapy_id, id: c.id ? { not: c.id } : undefined, scheduled_date: { gte: stay.start_date, lte: stay.end_date }, ...HAPPENING },
    include: { Patient: true }, orderBy: { scheduled_date: 'asc' },
  });
  if (!had) return null;
  const first = (had.Patient?.name || 'They').split(' ')[0];
  const day = had.scheduled_date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return { reason: 'ONCE_PER_COURSE', message: `${therapy.name} is given once a stay, and ${first}'s is on ${day}.`, actions: [{ kind: 'book_anyway', label: 'Book anyway' }] };
}
