/**
 * What is wrong with one day, and what would fix each thing.
 *
 * One rulebook. Two screens used to keep their own: `dayExceptions.ts` decided
 * the header's warnings and `VerifyDialog` ran its own checks in the browser,
 * and both disagreed with the server that actually refuses a booking — on the
 * seeded day, Verify reported a clean day while `PUT /appointments` refused four
 * of its treatments because the therapist was on leave.
 *
 * So the refusal here is `findConflict`, the same function the booking path
 * calls, and the fix is `replanStaffDay`, the same ladder that rehouses an
 * absent therapist's day: another pair of hands first, another time today next,
 * another day last. Nothing decides anything for itself, here or in the browser.
 *
 * Two classes of problem come back:
 *
 *   blocking      — the server would refuse this booking. Tested against it.
 *   worth_knowing — nobody refuses it and it still costs the centre a day: a
 *                   resident in house with nothing booked, a session with no
 *                   therapist's name on it, a treatment running through a meal.
 */
import { PrismaClient } from '@prisma/client';
import { findConflict, loadDay, type Candidate, type DayContext } from './appointmentGuard.js';
import { replanStaffDay, type Move } from './replan.js';
import { toMinutes } from './availability.js';

export type Fix = {
  label: string;
  tier: 1 | 2 | 3;
  /** Set when taking the fix moves the resident to another day. */
  cost_note: string | null;
  appointment_id: string;
  staff_id: string | null;
  staff_name: string;
  room_id: string | null;
  start_time: string;
  date: string;
};

export type DayProblem = {
  id: string;
  kind: string;
  problem_class: 'blocking' | 'worth_knowing';
  /** Who and what, for the top line of the card: "Meena Nair — Abhyanga, 09:00". */
  who: string;
  /** What is wrong, in one sentence. */
  what: string;
  appointment_id: string | null;
  patient_id: string | null;
  patient_name: string;
  staff_id: string | null;
  fix: Fix | null;
  /** Why there is no fix, when there is none. */
  no_fix_reason: string | null;
};

export type DayCheck = {
  date: string;
  problems: DayProblem[];
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
  STAFF_BUSY: 1,
  STAFF_IN_EVENT: 1,
  GENDER_MISMATCH: 2,
  PATIENT_BUSY: 3,
  ROOM_BUSY: 4,
  AMENITIES_MISSING: 5,
  NO_THERAPIST: 6,
  IDLE_RESIDENT: 7,
  EVENT_OVERLAP: 8,
};

/** The therapist is the thing in the way, so the fix must not offer them again. */
const THERAPIST_IS_THE_PROBLEM = new Set(['STAFF_OFF', 'STAFF_BUSY', 'STAFF_IN_EVENT', 'GENDER_MISMATCH']);

const candidateOf = (a: DayContext['appointments'][number]): Candidate => ({
  id: a.id,
  scheduled_date: a.scheduled_date,
  start_time: a.start_time,
  duration_minutes: a.duration_minutes,
  staff_id: a.staff_id,
  room_id: a.room_id,
  patient_id: a.patient_id,
  therapy_id: a.therapy_id,
});

/** "Sat 19 Sept" — a date the admin can read without decoding it. */
const dayName = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const fixFromMove = (m: Move, sameDay: boolean): Fix => ({
  label: m.tier === 1
    ? `Swap to ${m.to.staff_name}, same time`
    : sameDay
      ? `Move to ${m.to.start_time} with ${m.to.staff_name}`
      : `Move to ${dayName(m.to.date)}, ${m.to.start_time} with ${m.to.staff_name}`,
  tier: m.tier,
  cost_note: sameDay ? null : "changes the resident's diet day",
  appointment_id: m.appointment_id,
  staff_id: m.to.staff_id,
  staff_name: m.to.staff_name,
  room_id: m.to.room_id,
  start_time: m.to.start_time,
  date: m.to.date,
});

/**
 * The best available fix for one treatment, from the same ladder the whole-day
 * reassignment uses, and then checked against the guard: a fix the booking path
 * would refuse is not a fix.
 */
async function fixFor(
  appointment: DayContext['appointments'][number],
  reason: string,
  day: Date,
  prisma: PrismaClient,
  ctx: DayContext,
): Promise<{ fix: Fix | null; no_fix_reason: string | null }> {
  const plan = await replanStaffDay(
    THERAPIST_IS_THE_PROBLEM.has(reason) ? appointment.staff_id : null,
    day,
    prisma,
    { onlyAppointmentId: appointment.id },
  );
  const move = plan.moved[0] || plan.proposed[0] || null;
  if (!move) return { fix: null, no_fix_reason: plan.unplaced[0]?.reason || 'Nothing free anywhere this week.' };

  const sameDay = move.to.date === ymd(day);
  // A "fix" that leaves the treatment exactly where it is fixes nothing.
  if (sameDay && move.to.staff_id === appointment.staff_id && move.to.start_time === appointment.start_time && move.to.room_id === appointment.room_id) {
    return { fix: null, no_fix_reason: 'Nothing free anywhere this week.' };
  }
  if (sameDay) {
    const still = findConflict(
      { ...candidateOf(appointment), staff_id: move.to.staff_id, room_id: move.to.room_id, start_time: move.to.start_time },
      ctx,
    );
    if (still) return { fix: null, no_fix_reason: still.message };
  }
  return { fix: fixFromMove(move, sameDay), no_fix_reason: null };
}

/**
 * Up to three ways to fix one treatment, worst-first in the same order: another
 * pair of hands, another time today, another day. The ladder is asked again with
 * each answer's therapist excluded, so "other options" cannot invent a rule the
 * first answer did not have.
 *
 * `relax` switches off one of the two negotiable rules — the buffer between
 * treatments and the resident's own therapist. Nothing else is negotiable:
 * relaxing only widens the search, it never books what the guard refuses.
 */
export async function optionsFor(
  appointmentId: string,
  day: Date,
  prisma: PrismaClient,
  relax: { preferredStaff?: boolean; buffer?: boolean } = {},
): Promise<Fix[]> {
  const ctx = await loadDay(day, prisma);
  const appointment = ctx.appointments.find((a) => a.id === appointmentId);
  if (!appointment) return [];
  const conflict = findConflict(candidateOf(appointment), ctx);
  const excludeStaffIds: string[] = [];
  const out: Fix[] = [];

  for (let i = 0; i < 3; i++) {
    const plan = await replanStaffDay(
      conflict && THERAPIST_IS_THE_PROBLEM.has(conflict.reason) ? appointment.staff_id : null,
      day,
      prisma,
      {
        onlyAppointmentId: appointment.id,
        excludeStaffIds,
        relaxPreferredStaff: relax.preferredStaff,
        relaxBuffer: relax.buffer,
      },
    );
    const move = plan.moved[0] || plan.proposed[0] || null;
    if (!move) break;
    const fix = fixFromMove(move, move.to.date === ymd(day));
    if (!out.some((f) => f.staff_id === fix.staff_id && f.start_time === fix.start_time && f.date === fix.date)) out.push(fix);
    if (!move.to.staff_id) break;
    excludeStaffIds.push(move.to.staff_id);
  }
  return out;
}

/**
 * `withFixes: false` answers only what is wrong. The 30-day scan asks 30 times
 * and does not show a fix for any of them, and working one out costs a pass of
 * the ladder per problem.
 */
export async function checkDay(day: Date, prisma: PrismaClient, opts: { withFixes?: boolean } = {}): Promise<DayCheck> {
  const withFixes = opts.withFixes !== false;
  const ctx = await loadDay(day, prisma);
  const [stays, events] = await Promise.all([
    prisma.patientStay.findMany({ where: { start_date: { lte: day }, end_date: { gte: day } } }),
    prisma.programEvent.findMany(),
  ]);

  const nameOfPatient = (id: string | null) => ctx.patients.find((p) => p.id === id)?.name || 'Unknown';
  const nameOfTherapy = (id: string) => ctx.therapies.find((t) => t.id === id)?.name || 'Treatment';
  const appointments = [...ctx.appointments].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

  const raw: (DayProblem & { cost: number })[] = [];

  for (const a of appointments) {
    const who = `${nameOfPatient(a.patient_id)} — ${nameOfTherapy(a.therapy_id)}, ${a.start_time}`;

    // Blocking: exactly what the booking path refuses, from the same function.
    const conflict = findConflict(candidateOf(a), ctx);
    if (conflict) {
      const { fix, no_fix_reason } = withFixes ? await fixFor(a, conflict.reason, day, prisma, ctx) : { fix: null, no_fix_reason: null };
      raw.push({
        id: `${conflict.reason}:${a.id}`,
        kind: conflict.reason,
        problem_class: 'blocking',
        who,
        what: conflict.message,
        appointment_id: a.id,
        patient_id: a.patient_id,
        patient_name: nameOfPatient(a.patient_id),
        staff_id: a.staff_id,
        fix,
        no_fix_reason,
        cost: COST[conflict.reason] ?? 9,
      });
      continue;
    }

    // Worth knowing: nobody refuses a session with no name on it, and it is
    // still a resident standing in a corridor at 09:00.
    if (!a.staff_id) {
      const { fix, no_fix_reason } = withFixes ? await fixFor(a, 'NO_THERAPIST', day, prisma, ctx) : { fix: null, no_fix_reason: null };
      raw.push({
        id: `NO_THERAPIST:${a.id}`,
        kind: 'NO_THERAPIST',
        problem_class: 'worth_knowing',
        who,
        what: 'No therapist is on this treatment.',
        appointment_id: a.id,
        patient_id: a.patient_id,
        patient_name: nameOfPatient(a.patient_id),
        staff_id: null,
        fix,
        no_fix_reason,
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
      const row = ev as unknown as { patients_scope: string | null; is_optional: boolean; start_time: string; end_time: string; date: Date | null; start_date: Date | null; end_date: Date | null; recurrence: string | null; weekdays: string[]; activity_name: string };
      if ((row.patients_scope || 'all') !== 'all' || row.is_optional) return false;
      const onDay = (row.date && row.date.toDateString() === day.toDateString())
        || (row.start_date && row.end_date && row.start_date <= day && row.end_date >= day)
        || (row.recurrence === 'weekly' && Array.isArray(row.weekdays) && row.weekdays.length > 0);
      if (!onDay) return false;
      return s <= toMinutes(row.start_time) && e >= toMinutes(row.end_time);
    }) as unknown as { activity_name: string } | undefined;
    if (clash) {
      const { fix, no_fix_reason } = withFixes ? await fixFor(a, 'EVENT_OVERLAP', day, prisma, ctx) : { fix: null, no_fix_reason: null };
      raw.push({
        id: `EVENT_OVERLAP:${a.id}`,
        kind: 'EVENT_OVERLAP',
        problem_class: 'worth_knowing',
        who,
        what: `This runs through the whole of ${clash.activity_name}.`,
        appointment_id: a.id,
        patient_id: a.patient_id,
        patient_name: nameOfPatient(a.patient_id),
        staff_id: a.staff_id,
        fix,
        no_fix_reason,
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
      who: `${nameOfPatient(stay.patient_id)} — in house`,
      what: 'Nothing is booked for them today.',
      appointment_id: null,
      patient_id: stay.patient_id,
      patient_name: nameOfPatient(stay.patient_id),
      staff_id: null,
      fix: null,
      no_fix_reason: null,
      cost: COST.IDLE_RESIDENT,
    });
  }

  raw.sort((a, b) => a.cost - b.cost || a.who.localeCompare(b.who));
  const problems = raw.map(({ cost: _cost, ...p }) => p);
  return { date: ymd(day), problems, headline: headlineFor(problems) };
}

/**
 * The header's one line. A count tells the admin to open something; a name tells
 * them what happened before they touch anything, so the worst problem is named
 * with its residents and the rest are counted after it.
 */
export function headlineFor(problems: DayProblem[]): string | null {
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
