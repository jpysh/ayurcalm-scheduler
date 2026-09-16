// What is wrong with one day, in the words the admin would use. The Verify
// dialog has found most of this since it was written, but only when asked, two
// clicks deep; this is the same detection run on load so the header can report
// it. Pure, so it can be reasoned about without the app around it.

export type TimeOff = {
  entity_type: 'center' | 'staff' | 'room' | 'therapy' | 'patient';
  entity_id?: string | null;
  date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  recurrence?: 'weekly' | null;
  weekdays?: string[] | null;
};

export type DayAppointment = {
  id: string;
  patient_id: string;
  therapy_id: string;
  staff_id: string | null;
  room_id: string | null;
  start_time: string;
  duration_minutes: number;
  status?: string;
};

export type DayEvent = {
  activity_name: string;
  start_time: string;
  end_time: string;
  patients_scope?: string | null;
  is_optional?: boolean | null;
};

export type Named = { id: string; name: string };

export type DayException = {
  kind: 'staff_on_leave' | 'no_therapist' | 'room_clash' | 'event_overlap' | 'idle_resident';
  text: string;
  /** The therapist the warning is about, so the header can offer to rehouse their day. */
  staff_id?: string;
};

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export function toMinutes(t: string) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

/**
 * An event with no audience set applies to everyone: the field was added after
 * these events existed, the event form shows "All" for a null, and the day sheet
 * prints it for every resident. Reading null as "nobody" hid every seeded event
 * from the conflict checks.
 */
export function isAllGuests(ev: { patients_scope?: string | null }) {
  return (ev.patients_scope || 'all') === 'all';
}

/** Does this time-off record cover the given day? Dated, ranged and weekly all count. */
export function hitsTimeOff(h: TimeOff, day: Date) {
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (h.date && sameDay(new Date(h.date), day)) return true;
  if (h.start_date && h.end_date && new Date(h.start_date) <= day && new Date(h.end_date) >= day) return true;
  if (h.recurrence === 'weekly' && Array.isArray(h.weekdays) && h.weekdays.includes(WEEKDAYS[day.getDay()])) return true;
  return false;
}

const list = (names: string[], limit = 3) =>
  names.length <= limit ? names.join(', ') : `${names.slice(0, limit).join(', ')} and ${names.length - limit} more`;

export function dayExceptions(input: {
  day: Date;
  appointments: DayAppointment[];
  events: DayEvent[];
  timeoff: TimeOff[];
  patients: Named[];
  staff: Named[];
  rooms: Named[];
  therapies: Named[];
  residentIds: string[];
}): DayException[] {
  const { day, events, timeoff, residentIds } = input;
  const nameOf = (xs: Named[], id: string | null | undefined) =>
    xs.find((x) => String(x.id) === String(id))?.name || '';
  const appointments = input.appointments.filter((a) => a.status !== 'cancelled');
  const out: DayException[] = [];

  const offToday = timeoff.filter((h) => hitsTimeOff(h, day));

  // A therapist on leave who is still booked: the treatment will not happen and
  // nothing else on the screen says so.
  const onLeave = new Set(offToday.filter((h) => h.entity_type === 'staff').map((h) => String(h.entity_id)));
  const byLeaveStaff = new Map<string, number>();
  for (const a of appointments) {
    if (a.staff_id && onLeave.has(String(a.staff_id))) {
      byLeaveStaff.set(String(a.staff_id), (byLeaveStaff.get(String(a.staff_id)) || 0) + 1);
    }
  }
  for (const [id, n] of byLeaveStaff) {
    const name = nameOf(input.staff, id) || 'A therapist';
    out.push({ kind: 'staff_on_leave', staff_id: id, text: `${name} is on leave and still has ${n} treatment${n === 1 ? '' : 's'}` });
  }

  const unassigned = appointments.filter((a) => !a.staff_id);
  if (unassigned.length > 0) {
    const who = list(unassigned.map((a) => nameOf(input.patients, a.patient_id) || 'Unknown'));
    out.push({
      kind: 'no_therapist',
      text: `${unassigned.length} session${unassigned.length === 1 ? '' : 's'} with no therapist: ${who}`,
    });
  }

  // Two treatments in one room at the same time. One of them has nowhere to go.
  const byRoom = new Map<string, DayAppointment[]>();
  for (const a of appointments) {
    if (!a.room_id) continue;
    const arr = byRoom.get(String(a.room_id)) || [];
    arr.push(a);
    byRoom.set(String(a.room_id), arr);
  }
  for (const [roomId, arr] of byRoom) {
    const sorted = [...arr].sort((x, y) => toMinutes(x.start_time) - toMinutes(y.start_time));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const pS = toMinutes(prev.start_time);
      const cS = toMinutes(cur.start_time);
      if (overlaps(pS, pS + prev.duration_minutes, cS, cS + cur.duration_minutes)) {
        out.push({
          kind: 'room_clash',
          text: `${nameOf(input.rooms, roomId) || 'A room'}: ${nameOf(input.patients, prev.patient_id)} at ${prev.start_time} and ${nameOf(input.patients, cur.patient_id)} at ${cur.start_time} overlap`,
        });
      }
    }
  }

  // A required all-guests event is where the resident is expected to be, so a
  // treatment they cannot work around is a treatment they will not attend.
  // Optional classes raise nothing — a resident may skip yoga for an Abhyanga.
  // Neither does a treatment inside a meal window: breakfast runs 08:00-12:00
  // and an hour of it is still breakfast. Only a treatment covering the whole
  // event leaves the resident no way to be there.
  for (const a of appointments) {
    const s = toMinutes(a.start_time);
    const e = s + a.duration_minutes;
    const clash = events.find((ev) => isAllGuests(ev) && !ev.is_optional && s <= toMinutes(ev.start_time) && e >= toMinutes(ev.end_time));
    if (clash) {
      out.push({
        kind: 'event_overlap',
        text: `${nameOf(input.patients, a.patient_id)}'s ${nameOf(input.therapies, a.therapy_id)} at ${a.start_time} runs through ${clash.activity_name}`,
      });
    }
  }

  // A resident is paying to be treated. A day with nothing booked is the failure
  // the centre finds out about from the resident.
  const booked = new Set(appointments.map((a) => String(a.patient_id)));
  const idle = residentIds.filter((id) => !booked.has(String(id)));
  if (idle.length > 0) {
    const who = list(idle.map((id) => nameOf(input.patients, id) || 'Unknown'));
    out.push({
      kind: 'idle_resident',
      text: `${idle.length} resident${idle.length === 1 ? '' : 's'} in house with nothing scheduled: ${who}`,
    });
  }

  return out;
}
