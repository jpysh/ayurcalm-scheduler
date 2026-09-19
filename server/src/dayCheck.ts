/**
 * What is wrong with one day, and the one plan that fixes it.
 *
 * One rulebook. Two screens used to keep their own: `dayExceptions.ts` decided
 * the header's warnings and `VerifyDialog` ran its own checks in the browser,
 * and both disagreed with the server that actually refuses a booking — on the
 * seeded day, Verify reported a clean day while `PUT /appointments` refused four
 * of its treatments because the therapist was on leave.
 *
 * So the refusal here is `findConflict`, the same function the booking path
 * calls, and the fixes are one pass of `planDay`, the same planner that rehouses
 * an absent therapist's whole day: another pair of hands first, another time
 * today next, another day last.
 *
 * The day is planned in **one** pass, not once per problem. Asked separately,
 * two treatments clashing over one room were both told to move to 12:00, and
 * whichever the admin tapped second was refused. Planned together, every answer
 * knows about the others.
 *
 * Two classes of problem come back:
 *
 *   blocking      — must be fixed before the day runs: what the server would
 *                   refuse (tested against it), plus a treatment with no
 *                   therapist, where a resident waits and nobody comes.
 *                   Only these reach the header.
 *   worth_knowing — a note, never a warning: a resident in house with nothing
 *                   booked is often a rest day by design.
 */
import { PrismaClient } from '@prisma/client';
import { findConflict, loadDay, type Candidate, type DayContext } from './appointmentGuard.js';
import { planDay, type Move, type Pin } from './replan.js';
import { toMinutes } from './availability.js';

export type Fix = {
  label: string;
  tier: 1 | 2 | 3;
  /** Set when taking the fix moves the resident to another day. */
  cost_note: string | null;
  /** True when this row is the admin's own choice and the plan fits around it. */
  pinned: boolean;
  appointment_id: string;
  staff_id: string | null;
  /** Everyone else on the treatment after the fix. */
  co_staff_ids: string[];
  staff_name: string;
  room_id: string | null;
  start_time: string;
  date: string;
};

export type DayProblem = {
  id: string;
  kind: string;
  problem_class: 'blocking' | 'worth_knowing';
  /** Who and what: "Meena Nair — Abhyanga". The time is its own field. */
  who: string;
  start_time: string | null;
  /** What is wrong, in one sentence. */
  what: string;
  /** Problems sharing a cause share this, so the screen shows one heading. */
  group_key: string;
  appointment_id: string | null;
  patient_id: string | null;
  patient_name: string;
  staff_id: string | null;
  /** True when the resident's own-therapist rule is what leaves them stuck. */
  blocked_by_preferred_staff: boolean;
  fix: Fix | null;
  /** Why there is no fix, when there is none. */
  no_fix_reason: string | null;
};

export type ProblemGroup = {
  key: string;
  /** "Dr Raj Joshi is off — 4 treatments". */
  label: string;
  problem_class: 'blocking' | 'worth_knowing';
  /** Set when the whole group is one therapist's day, so it can be given away. */
  staff_id: string | null;
  problem_ids: string[];
};

export type DayCheck = {
  date: string;
  problems: DayProblem[];
  groups: ProblemGroup[];
  /** Every move of the plan, ready to be written as one batch. */
  plan: Fix[];
  /** The line the dashboard header shows, already written. */
  headline: string | null;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * How much a problem costs the centre, worst first. A resident nobody can treat
 * beats a resident whose treatment is in the wrong room, and anything blocking
 * beats anything merely wasteful.
 */
const COST: Record<string, number> = {
  STAFF_OFF: 0,
  ROOM_OFF: 0,
  STAFF_BUSY: 1,
  STAFF_IN_EVENT: 1,
  GENDER_MISMATCH: 2,
  STAFF_SHORT: 2,
  PATIENT_BUSY: 3,
  ROOM_BUSY: 4,
  AMENITIES_MISSING: 5,
  NO_THERAPIST: 6,
  IDLE_RESIDENT: 7,
  EVENT_OVERLAP: 8,
};

const candidateOf = (a: DayContext['appointments'][number]): Candidate => ({
  id: a.id,
  scheduled_date: a.scheduled_date,
  start_time: a.start_time,
  duration_minutes: a.duration_minutes,
  staff_id: a.staff_id,
  co_staff_ids: a.co_staff_ids,
  room_id: a.room_id,
  patient_id: a.patient_id,
  therapy_id: a.therapy_id,
});

/** "Sat 19 Sept" — a date the admin can read without decoding it. */
const dayName = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const fixFromMove = (m: Move, sameDay: boolean): Fix => ({
  label: m.tier === 1
    ? `${m.to.staff_name}, same time`
    : sameDay
      ? `${m.to.start_time} with ${m.to.staff_name}`
      : `${dayName(m.to.date)}, ${m.to.start_time} with ${m.to.staff_name}`,
  tier: m.tier,
  cost_note: sameDay ? null : "changes the resident's diet day",
  pinned: Boolean(m.pinned),
  appointment_id: m.appointment_id,
  staff_id: m.to.staff_id,
  co_staff_ids: m.to.co_staff_ids,
  staff_name: m.to.staff_name,
  room_id: m.to.room_id,
  start_time: m.to.start_time,
  date: m.to.date,
});

export type CheckOptions = {
  /** Skip the plan. The 30-day scan asks 30 times and shows no fixes. */
  withFixes?: boolean;
  /** Rows the admin decided themselves; the rest of the plan fits around them. */
  pins?: Pin[];
  /** The one negotiable rule: a resident's own therapist. */
  relaxPreferredStaff?: boolean;
};

export async function checkDay(day: Date, prisma: PrismaClient, opts: CheckOptions = {}): Promise<DayCheck> {
  const withFixes = opts.withFixes !== false;
  const ctx = await loadDay(day, prisma);
  const [stays, events] = await Promise.all([
    prisma.patientStay.findMany({ where: { start_date: { lte: day }, end_date: { gte: day } } }),
    prisma.programEvent.findMany(),
  ]);

  const nameOfPatient = (id: string | null) => ctx.patients.find((p) => p.id === id)?.name || 'Unknown';
  const nameOfTherapy = (id: string) => ctx.therapies.find((t) => t.id === id)?.name || 'Treatment';
  const nameOfStaff = (id: string | null) => ctx.staff.find((s) => s.id === id)?.name || 'A therapist';
  const appointments = [...ctx.appointments].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

  type Raw = DayProblem & { cost: number; group_label: string };
  const raw: Raw[] = [];

  for (const a of appointments) {
    const common = {
      who: `${nameOfPatient(a.patient_id)} — ${nameOfTherapy(a.therapy_id)}`,
      start_time: a.start_time,
      appointment_id: a.id,
      patient_id: a.patient_id,
      patient_name: nameOfPatient(a.patient_id),
      blocked_by_preferred_staff: false,
      fix: null,
      no_fix_reason: null,
    };

    // Blocking: exactly what the booking path refuses, from the same function.
    const conflict = findConflict(candidateOf(a), ctx);
    if (conflict) {
      // One heading per cause: an absent therapist is one thing that happened,
      // not four. A room clash names the room, so the pair sits together. The
      // therapist named is the one at fault, who need not be the lead.
      const culprit = (conflict.details?.staff_id as string | undefined) ?? a.staff_id;
      raw.push({
        ...common,
        id: `${conflict.reason}:${a.id}`,
        kind: conflict.reason,
        problem_class: 'blocking',
        what: conflict.message,
        group_key: `${conflict.reason}:${conflict.reason === 'ROOM_BUSY' || conflict.reason === 'ROOM_OFF' ? a.room_id : culprit}`,
        group_label: conflict.message,
        staff_id: culprit,
        cost: COST[conflict.reason] ?? 9,
      });
      continue;
    }

    // Must fix: nobody refuses a session with no name on it, and it is still a
    // resident standing in a corridor at 09:00.
    if (!a.staff_id) {
      raw.push({
        ...common,
        id: `NO_THERAPIST:${a.id}`,
        kind: 'NO_THERAPIST',
        problem_class: 'blocking',
        what: 'No therapist is on this treatment.',
        group_key: 'NO_THERAPIST',
        group_label: 'Treatments with no therapist',
        staff_id: null,
        cost: COST.NO_THERAPIST,
      });
      continue;
    }

    // A required all-guests event is where the resident is expected to be. An
    // optional class raises nothing, and an hour inside a four-hour breakfast is
    // still breakfast: only a treatment covering the whole event leaves the
    // resident no way to be there.
    const s = toMinutes(a.start_time);
    const e = s + a.duration_minutes;
    const clash = events.find((ev) => {
      const row = ev as unknown as { patients_scope: string | null; is_optional: boolean; start_time: string; end_time: string; date: Date | null; start_date: Date | null; end_date: Date | null; recurrence: string | null; weekdays: string[] };
      if ((row.patients_scope || 'all') !== 'all' || row.is_optional) return false;
      const onDay = (row.date && row.date.toDateString() === day.toDateString())
        || (row.start_date && row.end_date && row.start_date <= day && row.end_date >= day)
        || (row.recurrence === 'weekly' && Array.isArray(row.weekdays) && row.weekdays.length > 0);
      if (!onDay) return false;
      return s <= toMinutes(row.start_time) && e >= toMinutes(row.end_time);
    }) as unknown as { activity_name: string } | undefined;
    if (clash) {
      raw.push({
        ...common,
        id: `EVENT_OVERLAP:${a.id}`,
        kind: 'EVENT_OVERLAP',
        problem_class: 'worth_knowing',
        what: `This runs through the whole of ${clash.activity_name}.`,
        group_key: `EVENT_OVERLAP:${clash.activity_name}`,
        group_label: `Treatments running through ${clash.activity_name}`,
        staff_id: a.staff_id,
        cost: COST.EVENT_OVERLAP,
      });
    }
  }

  // A resident is paying to be treated. A day with nothing booked is the
  // failure the centre hears about from the resident.
  const booked = new Set(appointments.map((a) => a.patient_id));
  for (const stay of stays) {
    if (booked.has(stay.patient_id)) continue;
    raw.push({
      id: `IDLE_RESIDENT:${stay.patient_id}`,
      kind: 'IDLE_RESIDENT',
      problem_class: 'worth_knowing',
      who: nameOfPatient(stay.patient_id),
      start_time: null,
      what: 'Nothing is booked for them today.',
      group_key: 'IDLE_RESIDENT',
      group_label: 'Residents in house with nothing booked',
      appointment_id: null,
      patient_id: stay.patient_id,
      patient_name: nameOfPatient(stay.patient_id),
      staff_id: null,
      blocked_by_preferred_staff: false,
      fix: null,
      no_fix_reason: null,
      cost: COST.IDLE_RESIDENT,
    });
  }

  raw.sort((a, b) => a.cost - b.cost || (a.start_time || '').localeCompare(b.start_time || '') || a.who.localeCompare(b.who));

  // One plan for everything that can move, worked out together so that no two
  // answers take the same room at the same minute.
  const plan: Fix[] = [];
  if (withFixes) {
    const movable = raw.filter((p) => p.appointment_id).map((p) => p.appointment_id as string);
    if (movable.length > 0) {
      const result = await planDay(null, day, prisma, {
        appointmentIds: movable,
        pins: opts.pins,
        relaxPreferredStaff: opts.relaxPreferredStaff,
      });
      const byAppointment = new Map<string, Fix>();
      for (const m of [...result.moved, ...result.proposed]) {
        byAppointment.set(m.appointment_id, fixFromMove(m, m.to.date === ymd(day)));
      }
      const unplacedBy = new Map(result.unplaced.map((u) => [u.appointment_id, u.reason]));
      for (const p of raw) {
        if (!p.appointment_id) continue;
        const appt = appointments.find((a) => a.id === p.appointment_id);
        const fix = byAppointment.get(p.appointment_id) || null;
        // A plan that leaves a treatment exactly where it is has fixed nothing.
        const noop = Boolean(
          fix && appt && fix.date === ymd(day) && fix.staff_id === appt.staff_id &&
          fix.co_staff_ids.join() === appt.co_staff_ids.join() &&
          fix.start_time === appt.start_time && fix.room_id === appt.room_id,
        );
        p.fix = noop ? null : fix;
        p.no_fix_reason = p.fix ? null : unplacedBy.get(p.appointment_id) || 'Nothing free anywhere this week.';
        p.blocked_by_preferred_staff = Boolean(p.no_fix_reason && /only treated by/i.test(p.no_fix_reason));
        if (p.fix) plan.push(p.fix);
      }
    }
  }

  const groups: ProblemGroup[] = [];
  for (const p of raw) {
    const existing = groups.find((g) => g.key === p.group_key);
    if (existing) {
      existing.problem_ids.push(p.id);
      continue;
    }
    groups.push({
      key: p.group_key,
      label: p.group_label,
      problem_class: p.problem_class,
      // Only an absence is a whole day to give away; a room clash is not.
      staff_id: p.kind === 'STAFF_OFF' ? p.staff_id : null,
      problem_ids: [p.id],
    });
  }
  for (const g of groups) {
    const n = g.problem_ids.length;
    if (g.key.startsWith('STAFF_OFF:')) {
      const first = raw.find((x) => x.id === g.problem_ids[0]);
      g.label = `${nameOfStaff(first?.staff_id ?? null)} is off — ${n} treatment${n === 1 ? '' : 's'}`;
    } else if (n > 1 && g.key !== 'IDLE_RESIDENT' && g.key !== 'NO_THERAPIST') {
      g.label = `${g.label} (${n} treatments)`;
    }
  }

  const problems: DayProblem[] = raw.map(({ cost: _cost, group_label: _label, ...p }) => p);
  return { date: ymd(day), problems, groups, plan, headline: headlineFor(problems) };
}

/**
 * Other ways to place one treatment, for the admin who does not like the row
 * they were given. The planner is asked again with the answers already offered
 * excluded and the admin's other choices held, so an alternative is never
 * something the plan could not accept.
 */
export async function rowOptions(
  appointmentId: string,
  day: Date,
  prisma: PrismaClient,
  opts: { pins?: Pin[]; relaxPreferredStaff?: boolean } = {},
): Promise<Fix[]> {
  const excludeStaffIds: string[] = [];
  const out: Fix[] = [];
  for (let i = 0; i < 3; i++) {
    const result = await planDay(null, day, prisma, {
      appointmentIds: [appointmentId],
      pins: (opts.pins || []).filter((p) => p.appointment_id !== appointmentId),
      relaxPreferredStaff: opts.relaxPreferredStaff,
      excludeStaffIds,
    });
    const move = result.moved[0] || result.proposed[0] || null;
    if (!move) break;
    const fix = fixFromMove(move, move.to.date === ymd(day));
    if (!out.some((f) => f.staff_id === fix.staff_id && f.start_time === fix.start_time && f.date === fix.date)) out.push(fix);
    if (!move.to.staff_id) break;
    excludeStaffIds.push(move.to.staff_id);
  }
  return out;
}

/**
 * The header's one line. A count tells the admin to open something; a name tells
 * them what happened before they touch anything, so the worst problem is named
 * with its residents and the rest are counted after it.
 */
export function headlineFor(all: DayProblem[]): string | null {
  // Notes stay inside Verify: the header is only for what must be fixed.
  const problems = all.filter((p) => p.problem_class === 'blocking');
  if (problems.length === 0) return null;
  const worst = problems[0];
  const sameKind = problems.filter((p) => p.kind === worst.kind);
  // Every resident is named. "and 2 more" saves a line and costs the admin the
  // one thing the line is for: knowing who is affected before they open it.
  const names = [...new Set(sameKind.map((p) => p.patient_name))];
  const who = names.join(', ');
  const rest = problems.length - sameKind.length;
  const tail = rest > 0 ? `, and ${rest} more to fix` : '';

  const head = worst.kind === 'IDLE_RESIDENT'
    ? `${names.length} resident${names.length === 1 ? '' : 's'} in house with nothing booked: ${who}`
    : worst.kind === 'NO_THERAPIST'
      ? `${sameKind.length} treatment${sameKind.length === 1 ? '' : 's'} with no therapist: ${who}`
      : `${worst.what.replace(/\.$/, '')} — ${who}`;
  return `${head}${tail}`;
}
