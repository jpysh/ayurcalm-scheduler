/**
 * When a therapist is not free. Absences were the only answer for a long time,
 * so a therapist running the 07:30 yoga class could be booked for an Abhyanga
 * at 07:30 — one person, two rooms. An event a therapist is running is time
 * they are not available, exactly as an absence is.
 *
 * Pure, so the rules can be tested without a database.
 */

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type EventRow = {
  date: Date | null;
  start_date: Date | null;
  end_date: Date | null;
  start_time: string;
  end_time: string;
  activity_name: string;
  recurrence: string | null;
  weekdays: string[];
  staff_id: string | null;
  staff_scope: string | null;
  staff_ids: string[];
};

export type Busy = { s: number; e: number; label: string };

export const toMinutes = (t: string) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};

export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(aStart, bStart) < Math.min(aEnd, bEnd);

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Does this event run on this day? A single date, a date range, or a weekly recurrence. */
export const eventHitsDay = (e: EventRow, day: Date) => {
  if (e.date && sameDay(e.date, day)) return true;
  if (e.start_date && e.end_date && e.start_date <= day && e.end_date >= day) return true;
  if (e.recurrence === 'weekly' && Array.isArray(e.weekdays) && e.weekdays.includes(WEEKDAYS[day.getDay()])) return true;
  return false;
};

/**
 * Whether an event ties up a given therapist. `staff_scope` decides: "all" is
 * every therapist in the centre, "none" is nobody, anything else means the
 * named ones. A bare `staff_id` with no scope predates the field and counts.
 */
export const eventAppliesToStaff = (e: EventRow, staffId: string) => {
  const scope = e.staff_scope || (e.staff_id ? 'custom' : 'none');
  if (scope === 'all') return true;
  if (scope === 'none') return false;
  return e.staff_id === staffId || (Array.isArray(e.staff_ids) && e.staff_ids.includes(staffId));
};

/**
 * How specific an event's schedule is: a one-off beats a Mondays-only class,
 * which beats something daily. Used to let the Monday havan stand in for the
 * morning prayer without either event having to name the other.
 */
const specificity = (e: EventRow) => {
  if (e.date) return 0;
  if (e.recurrence === 'weekly' && Array.isArray(e.weekdays) && e.weekdays.length > 0) return e.weekdays.length;
  return WEEKDAYS.length + 1;
};

/**
 * The events actually running on a day. Where two overlap in time, the more
 * specific one replaces the other for that day: the centre does not hold the
 * daily morning prayer on the Monday the havan runs over it.
 */
export const activeEventsOnDay = (events: EventRow[], day: Date): EventRow[] => {
  const onDay = events.filter((e) => eventHitsDay(e, day));
  return onDay.filter((e) => {
    const mine = specificity(e);
    return !onDay.some(
      (other) =>
        other !== e &&
        specificity(other) < mine &&
        overlaps(toMinutes(e.start_time), toMinutes(e.end_time), toMinutes(other.start_time), toMinutes(other.end_time)),
    );
  });
};

/** The intervals a therapist is tied up in events on this day. */
export const staffEventBusy = (events: EventRow[], staffId: string, day: Date): Busy[] =>
  activeEventsOnDay(events, day)
    .filter((e) => eventAppliesToStaff(e, staffId))
    .map((e) => ({ s: toMinutes(e.start_time), e: toMinutes(e.end_time), label: e.activity_name }));

/** The event in the way of a booking, if there is one. */
export const eventBlocking = (events: EventRow[], staffId: string, day: Date, start: number, end: number) =>
  staffEventBusy(events, staffId, day).find((b) => overlaps(b.s, b.e, start, end));

/** Everyone working on a treatment, the lead first. */
export const teamOf = (a: { staff_id: string | null; co_staff_ids?: string[] | null }): string[] =>
  [...new Set([a.staff_id, ...(a.co_staff_ids || [])].filter((id): id is string => Boolean(id)))];

/**
 * Treatments an event would land on: a therapist it ties up is already treating
 * someone then. The guard refuses a treatment over an event; this is the same
 * rule from the other side, so saving an event cannot double-book anyone.
 */
export const eventClashes = <A extends { staff_id: string | null; co_staff_ids?: string[] | null; scheduled_date: Date; start_time: string; duration_minutes: number | null }>(
  e: EventRow, appts: A[],
): A[] =>
  appts.filter((a) =>
    eventHitsDay(e, a.scheduled_date)
    && teamOf(a).some((id) => eventAppliesToStaff(e, id))
    && overlaps(toMinutes(e.start_time), toMinutes(e.end_time), toMinutes(a.start_time), toMinutes(a.start_time) + (a.duration_minutes || 0)));
