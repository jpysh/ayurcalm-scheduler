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
import { DEFAULT_MAX_PER_DAY, findConflict, loadDay, type Action, type Candidate, type DayContext } from './appointmentGuard.js';
import { planDay, type Move, type Pin } from './replan.js';
import { centreClock, startedBefore, toMinutes, type Clock } from './availability.js';

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
  /** Tier 4: which choice this is, and every choice for the row (#135). */
  choice?: 'this_time_only' | 'next_free_day' | 'cancel';
  cancel?: boolean;
  choices?: Fix[];
};

export type DayProblem = {
  id: string;
  kind: string;
  problem_class: 'blocking' | 'worth_knowing';
  /** A therapist's SOS (#521): a note, but it counts on the pill and cannot be missed. */
  urgent?: boolean;
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
  /** Tier 4: what the admin can pick from, the fix among them when one is selected. */
  choices: Fix[];
  /** Why there is no fix, when there is none. */
  no_fix_reason: string | null;
  /** The fix for the cause, when the cause is the team (#368). */
  actions?: Action[];
  /** A therapist's "Room not usable" (#695): the room, so one tap opens Not available on it. */
  room_out?: { room_id: string; reason: string | null };
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
  /** Finished treatments whose therapist or room was not there: id → "Ravi was not in". Information, never counted (#394). */
  history: Record<string, string>;
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
  THERAPY_OFF: 0,
  PATIENT_OFF: 0,
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
export const dayName = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const fixFromMove = (m: Move, sameDay: boolean): Fix => ({
  label: (m.cancel
    ? 'Cancel this treatment'
    : m.tier === 1
      // Name what changes, the therapist, the room or both (#187).
      ? m.to.room_id === m.from.room_id ? `${m.to.staff_name}, same time`
        : m.to.staff_name === m.from.staff_name ? `Move to ${m.to.room_name}, same time`
        : `${m.to.staff_name} in ${m.to.room_name}, same time`
      : sameDay
        ? `${m.to.start_time} with ${m.to.staff_name}`
        : `${dayName(m.to.date)}, ${m.to.start_time} with ${m.to.staff_name}`) + (m.note ? ` (${m.note})` : ''),
  tier: m.tier,
  choice: m.choice,
  cancel: m.cancel,
  choices: m.choices?.map((c) => fixFromMove(c, c.to.date === m.from.date)),
  cost_note: sameDay || m.cancel ? null : "changes the patient's diet day",
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
  /** The centre's clock. Defaults to now; tests pass a fixed one. */
  now?: Clock;
};

export async function checkDay(day: Date, prisma: PrismaClient, opts: CheckOptions = {}): Promise<DayCheck> {
  const withFixes = opts.withFixes !== false;
  const ctx = await loadDay(day, prisma);
  const now = opts.now ?? centreClock(ctx.settings?.timezone || 'Asia/Kolkata');
  const cutoff = startedBefore(now, day);
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
  const history: Record<string, string> = {};

  for (const a of appointments) {
    // Over: it happened as it happened. Under way: only a missing therapist or
    // room still matters, since someone is waiting on the couch now (#367).
    const underWay = toMinutes(a.start_time) < cutoff;
    if (underWay && toMinutes(a.start_time) + a.duration_minutes <= cutoff) {
      // The printed sheet still says so, so the row must too (#394).
      const was = findConflict(candidateOf(a), ctx);
      if (was?.reason === 'STAFF_OFF') history[a.id] = `${nameOfStaff((was.details?.staff_id as string | undefined) ?? a.staff_id).split(' ')[0]} was not in`;
      if (was?.reason === 'ROOM_OFF') history[a.id] = 'Room was out of use';
      continue;
    }
    const common = {
      who: `${nameOfPatient(a.patient_id)} — ${nameOfTherapy(a.therapy_id)}`,
      start_time: a.start_time,
      appointment_id: a.id,
      patient_id: a.patient_id,
      patient_name: nameOfPatient(a.patient_id),
      blocked_by_preferred_staff: false,
      fix: null,
      choices: [],
      no_fix_reason: null,
    };

    // Blocking: exactly what the booking path refuses, from the same function.
    const found = findConflict(candidateOf(a), ctx);
    const conflict = underWay && found?.reason !== 'STAFF_OFF' && found?.reason !== 'ROOM_OFF' ? null : found;
    if (underWay && !conflict) continue;
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
        what: underWay ? `${nameOfPatient(a.patient_id).split(' ')[0]} is waiting: ${conflict.message}` : conflict.message,
        group_key: `${conflict.reason}:${conflict.reason === 'ROOM_BUSY' || conflict.reason === 'ROOM_OFF' ? a.room_id : conflict.reason === 'THERAPY_OFF' ? a.therapy_id : conflict.reason === 'PATIENT_OFF' ? a.patient_id : culprit}`,
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

  // A consultation that has ended today may have changed the plan (#219): the
  // admin is asked, once, to look at the resident's diet and treatments.
  if (Number.isFinite(cutoff)) {
    for (const a of appointments) {
      const t = ctx.therapies.find((x) => x.id === a.therapy_id);
      if (!t?.is_consultation || a.status === 'cancelled' || a.status === 'no_show') continue;
      if (toMinutes(a.start_time) + a.duration_minutes > cutoff) continue;
      raw.push({
        id: `CONSULTED:${a.id}`, kind: 'CONSULTED', problem_class: 'worth_knowing',
        who: nameOfPatient(a.patient_id), start_time: a.start_time,
        what: `Seen by ${nameOfStaff(a.staff_id)}. Update their diet or treatments?`,
        group_key: 'CONSULTED', group_label: 'Consultations to act on',
        appointment_id: a.id, patient_id: a.patient_id, patient_name: nameOfPatient(a.patient_id), staff_id: a.staff_id,
        blocked_by_preferred_staff: false, fix: null, choices: [], no_fix_reason: null, cost: COST.IDLE_RESIDENT,
      });
    }
  }

  // From the private links (#219): what the team raised today, and a resident's
  // 👎. Notes to read, never a fix: the admin decides, and Dismiss clears them.
  const key = day.toISOString().slice(0, 10);
  // A day either side in UTC covers the centre's day in any time zone; the date check below picks it out.
  const issues = await prisma.linkIssue.findMany({ where: { seen: false, OR: [{ appointment_id: { in: appointments.map((a) => a.id) } }, { appointment_id: null, created_at: { gte: new Date(day.getTime() - 86400000), lt: new Date(day.getTime() + 2 * 86400000) } }] }, orderBy: { created_at: 'asc' } });
  const ISSUE: Record<string, string> = { room: 'Room not usable', co_therapist: 'Co-therapist not here', patient_absent: 'Patient not here', permission: 'Needs permission', note: 'A note', sos: 'SOS: needs help now' };
  for (const i of issues) {
    const a = i.appointment_id ? appointments.find((x) => x.id === i.appointment_id) : null;
    // Raised on the centre's day, for that day's treatment, or with none: the one the admin is looking at.
    if (i.appointment_id ? !a : centreClock(ctx.settings?.timezone || 'Asia/Kolkata', i.created_at).date !== key) continue;
    raw.push({
      id: `ISSUE:${i.id}`, kind: 'ISSUE', problem_class: 'worth_knowing', urgent: i.kind === 'sos',
      who: a ? `${nameOfStaff(i.staff_id)} — ${nameOfPatient(a.patient_id)}` : nameOfStaff(i.staff_id), start_time: a?.start_time ?? null,
      what: [ISSUE[i.kind] || i.kind, i.note].filter(Boolean).join(': '),
      group_key: 'ISSUE', group_label: 'Raised by staff',
      ...(i.kind === 'room' && a?.room_id ? { room_out: { room_id: a.room_id, reason: i.note ?? null } } : {}),
      appointment_id: null, patient_id: a?.patient_id ?? null, patient_name: a ? nameOfPatient(a.patient_id) : '', staff_id: i.staff_id,
      blocked_by_preferred_staff: false, fix: null, choices: [], no_fix_reason: null, cost: i.kind === 'sos' ? -1 : COST.IDLE_RESIDENT,
    });
  }
  for (const a of appointments) {
    const r = (a.record || {}) as { feedback?: string; feedback_note?: string };
    if (r.feedback !== 'down') continue;
    raw.push({
      id: `FEEDBACK:${a.id}`, kind: 'FEEDBACK', problem_class: 'worth_knowing',
      who: `${nameOfPatient(a.patient_id)} — ${nameOfTherapy(a.therapy_id)}`, start_time: a.start_time,
      what: `👎 ${r.feedback_note || 'Did not like it'}`,
      group_key: 'FEEDBACK', group_label: 'Patients not happy',
      appointment_id: null, patient_id: a.patient_id, patient_name: nameOfPatient(a.patient_id), staff_id: a.staff_id,
      blocked_by_preferred_staff: false, fix: null, choices: [], no_fix_reason: null, cost: COST.IDLE_RESIDENT,
    });
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
      group_label: 'Patients in house with nothing booked',
      appointment_id: null,
      patient_id: stay.patient_id,
      patient_name: nameOfPatient(stay.patient_id),
      staff_id: null,
      blocked_by_preferred_staff: false,
      fix: null,
      choices: [],
      no_fix_reason: null,
      cost: COST.IDLE_RESIDENT,
    });
  }

  // Over the daily limit (#330): a note, since the admin may have chosen it with Book anyway.
  const max = ctx.settings?.max_treatments_per_day ?? DEFAULT_MAX_PER_DAY;
  for (const stay of stays) {
    const n = appointments.filter((a) => a.patient_id === stay.patient_id).length;
    if (n <= max) continue;
    raw.push({
      id: `DAY_FULL:${stay.patient_id}`, kind: 'DAY_FULL', problem_class: 'worth_knowing',
      who: nameOfPatient(stay.patient_id), start_time: null,
      what: `${n} treatments today, more than the usual ${max}.`,
      group_key: 'DAY_FULL', group_label: 'Patients with a long day',
      appointment_id: null, patient_id: stay.patient_id, patient_name: nameOfPatient(stay.patient_id), staff_id: null,
      blocked_by_preferred_staff: false, fix: null, choices: [], no_fix_reason: null, cost: COST.IDLE_RESIDENT,
    });
  }

  raw.sort((a, b) => a.cost - b.cost || (a.start_time || '').localeCompare(b.start_time || '') || a.who.localeCompare(b.who));

  // One plan for everything that can move, worked out together so that no two
  // answers take the same room at the same minute.
  const plan: Fix[] = [];
  if (withFixes) {
    // A consultation note points at an appointment that is over and fine: nothing to move.
    const toPlan = raw.filter((p) => p.appointment_id && p.kind !== 'CONSULTED');
    const movable = toPlan.map((p) => p.appointment_id as string);
    if (movable.length > 0) {
      const result = await planDay(null, day, prisma, {
        appointmentIds: movable,
        pins: opts.pins,
        relaxPreferredStaff: opts.relaxPreferredStaff,
        now,
      });
      const byAppointment = new Map<string, Fix>();
      for (const m of [...result.moved, ...result.proposed]) {
        byAppointment.set(m.appointment_id, fixFromMove(m, m.to.date === ymd(day)));
      }
      const unplacedBy = new Map(result.unplaced.map((u) => [u.appointment_id, u.reason]));
      const actionsBy = new Map(result.unplaced.map((u) => [u.appointment_id, u.actions ?? []]));
      const choicesBy = new Map(result.unplaced.map((u) => [u.appointment_id, (u.choices || []).map((c) => fixFromMove(c, c.to.date === ymd(day)))]));
      for (const p of toPlan) {
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
        p.choices = p.fix?.choices || choicesBy.get(p.appointment_id) || [];
        p.no_fix_reason = p.fix ? null : unplacedBy.get(p.appointment_id) || 'Nothing free in the next 30 days. It can be cancelled.';
        if (!p.fix && actionsBy.get(p.appointment_id)?.length) p.actions = actionsBy.get(p.appointment_id);
        p.blocked_by_preferred_staff = false;
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
    } else if (n > 1 && g.key !== 'IDLE_RESIDENT' && g.key !== 'NO_THERAPIST' && g.key !== 'CONSULTED') {
      g.label = `${g.label} (${n} treatments)`;
    }
  }

  const problems: DayProblem[] = raw.map(({ cost: _cost, group_label: _label, ...p }) => p);
  return { date: ymd(day), problems, groups, plan, headline: headlineFor(problems), history };
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
    ? `${names.length} patient${names.length === 1 ? '' : 's'} in house with nothing booked: ${who}`
    : worst.kind === 'NO_THERAPIST'
      ? `${sameKind.length} treatment${sameKind.length === 1 ? '' : 's'} with no therapist: ${who}`
      : `${worst.what.replace(/\.$/, '')} — ${who}`;
  return `${head}${tail}`;
}

export type RangeRow = { date: string; who: string; start_time: string | null; fix: Fix };

/**
 * "Save and fix" over several days (#695): each day's own plan, gathered into
 * one list to accept as one batch with one Undo. Only rows with a single answer
 * that stays on its own day join it, so no two days' answers can meet on the
 * same minute; a row that needs a choice or another day waits under What needs
 * you for the admin, as does anything with no answer.
 */
export async function planRange(from: string, to: string, prisma: PrismaClient, opts: { now?: Clock } = {}) {
  const rows: RangeRow[] = [];
  /** What waits for the admin, named, so the plan says what it leaves (#706). */
  const waiting: { date: string; who: string; start_time: string | null; what: string }[] = [];
  // ponytail: capped at 31 days, as one plan; a longer absence plans its first month.
  for (let d = new Date(`${from}T00:00:00.000Z`), n = 0; ymd(d) <= to && n < 31; d.setUTCDate(d.getUTCDate() + 1), n++) {
    const day = new Date(d);
    // A row left for the admin stays where it is, so the rest is planned again
    // around it: its slot was counted as free once the planner moved it away.
    const pins: Pin[] = [];
    let check = await checkDay(day, prisma, { now: opts.now });
    const waits = (c: DayCheck) => c.problems.filter((p) => p.problem_class === 'blocking' && p.appointment_id && !(p.fix && p.choices.length <= 1 && p.fix.date === c.date) && !pins.some((x) => x.appointment_id === p.appointment_id));
    for (let more = waits(check); more.length && pins.length < 200; more = waits(check)) {
      const held = await prisma.appointment.findMany({ where: { id: { in: more.map((p) => p.appointment_id!) } } });
      pins.push(...held.map((a) => ({ appointment_id: a.id, staff_id: a.staff_id, co_staff_ids: a.co_staff_ids, room_id: a.room_id, start_time: a.start_time, date: check.date })));
      check = await checkDay(day, prisma, { now: opts.now, pins });
    }
    for (const p of check.problems.filter((x) => x.problem_class === 'blocking')) {
      if (p.fix && !p.fix.pinned && p.choices.length <= 1 && p.fix.date === check.date) rows.push({ date: check.date, who: p.who, start_time: p.start_time, fix: p.fix });
      else waiting.push({ date: check.date, who: p.who, start_time: p.start_time, what: p.what });
    }
  }
  return { rows, left: waiting.length, waiting };
}
