/**
 * What needs the admin (#288, story 1): the rules behind the pill, the number
 * each would raise today, and the patient and team items the pill's sheet lists
 * beside the day's own problems (`checkDay`, which this reads and never decides).
 *
 * A rule has a default here; the admin's changes are the only thing stored
 * (`Settings.attention_rules`), so a default can improve without touching a centre.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { centreClock } from './availability.js';
import { checkDay, dayName } from './dayCheck.js';
import { loadDay, staffDay } from './appointmentGuard.js';
import { loadDietsForDay } from './dietResolution.js';
import { nightsEnd, outNight } from './guestRooms.js';

const DAY_MS = 86400000;

export type Rule = {
  id: string;
  section: 'Day' | 'Patients' | 'Team';
  name: string;
  /** Said in words: an action item counts on the pill; information shows in grey and does not. */
  kind: 'action' | 'information';
  on: boolean;
  /** On and cannot be switched off. */
  locked?: boolean;
  /** The "when": hours after arrival, or after a treatment starts. */
  hours?: number;
  /** What the "when" counts from, for the sentence: "after {hours} hours {from}". */
  from?: string;
  /** A rule whose data does not exist yet: it shows, and raises nothing. */
  waiting?: string;
};

export const RULES: Rule[] = [
  { id: 'day', section: 'Day', kind: 'action', locked: true, on: true, name: 'A therapist is not in, a room is out, or treatments clash' },
  { id: 'leaves_today', section: 'Patients', kind: 'action', on: true, name: 'Leaves today and has no discharge summary' },
  { id: 'arrival_open', section: 'Patients', kind: 'action', on: true, hours: 24, from: 'of arriving', name: 'Arrival steps still open' },
  { id: 'no_diet', section: 'Patients', kind: 'action', on: true, hours: 24, from: 'of arriving', name: 'No diet plan' },
  { id: 'room_out', section: 'Patients', kind: 'action', on: true, name: "A guest's room is out of use" },
  { id: 'form_c', section: 'Patients', kind: 'action', on: true, name: 'Form C for a foreign guest, due a day after arriving' },
  { id: 'follow_up', section: 'Patients', kind: 'action', on: true, name: 'Follow-up due after discharge' },
  { id: 'leaves_tomorrow', section: 'Patients', kind: 'action', on: false, name: 'Leaves tomorrow and the discharge summary is not started' },
  { id: 'vitals', section: 'Team', kind: 'action', on: true, hours: 4, from: 'after the treatment starts', waiting: 'Starts when therapists record readings', name: 'Vitals not recorded' },
  { id: 'feedback', section: 'Patients', kind: 'information', on: true, name: 'A guest said their stay was good or fine' },
  { id: 'feedback_poor', section: 'Patients', kind: 'action', on: true, name: 'A guest said their stay was not good' },
  { id: 'on_leave', section: 'Team', kind: 'information', on: true, name: 'Who is on leave today' },
];

/** What a guest's answer is called on the admin's side (#509). */
export const RATING: Record<string, string> = { good: 'Stay was good', fine: 'Stay was fine', poor: 'Stay was not good' };

export type Changes = Record<string, { on?: boolean; hours?: number }>;

export const changesSchema = z.record(z.string(), z.object({ on: z.boolean().optional(), hours: z.number().int().min(1).max(720).optional() }))
  .refine((c) => Object.keys(c).every((id) => RULES.some((r) => r.id === id)), 'Unknown rule');

/** The rules as this centre has them: defaults, then the admin's changes. A locked rule stays on. */
export const rulesWith = (changes: unknown): Rule[] => {
  const c = (changes && typeof changes === 'object' ? changes : {}) as Changes;
  return RULES.map((r) => ({ ...r, on: r.locked ? true : c[r.id]?.on ?? r.on, ...(r.hours !== undefined ? { hours: c[r.id]?.hours ?? r.hours } : {}) }));
};

export type Item = {
  id: string;
  rule: string;
  section: 'Patients' | 'Team';
  kind: 'action' | 'information';
  who: string;
  what: string;
  patient_id?: string;
  /** What the one tap does: open their card, their meals, their discharge summary, their follow-up message. */
  action?: 'card' | 'diet' | 'summary' | 'followup';
};

/** A guest whose country is not India needs a Form C within 24 hours of arriving (#415). An empty country is not assumed foreign. */
export const isForeign = (country: string | null | undefined) => !!country?.trim() && !/^(india|indian|bharat|in)$/i.test(country.trim());
/** The day it is due: the day after arrival, since the stay has no arrival hour. */
export const formCDue = (start: Date) => ymd(new Date(start.getTime() + DAY_MS));

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** For one day (today unless asked): each rule with how many items it would raise, and the items of the rules that are on. */
export async function attentionFor(prisma: PrismaClient, date?: string) {
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const clock = centreClock(settings?.timezone || 'Asia/Kolkata');
  const today = date || clock.date;
  const day = new Date(`${today}T00:00:00.000Z`);
  const tomorrow = ymd(new Date(day.getTime() + DAY_MS));
  // A day asked for that is not today reads at midday, so the answer does not depend on the hour.
  const hourNow = today === clock.date ? Number(clock.time.slice(0, 2)) : 12;
  const rules = rulesWith(settings?.attention_rules);
  const rule = (id: string) => rules.find((r) => r.id === id)!;

  const stays = await prisma.patientStay.findMany({ where: { start_date: { lte: day }, end_date: { gte: new Date(day.getTime()) } }, include: { Patient: { select: { id: true, name: true, country: true } } } });
  const upcoming = await prisma.patientStay.findMany({ where: { end_date: new Date(`${tomorrow}T00:00:00.000Z`), start_date: { lte: day } }, include: { Patient: { select: { id: true, name: true } } } });
  const diets = await loadDietsForDay(day, prisma);
  const hoursIn = (s: { start_date: Date }) => Math.round((day.getTime() - s.start_date.getTime()) / DAY_MS) * 24 + hourNow;

  const found: Item[] = [];
  const add = (r: Rule, s: { Patient: { id: string; name: string } }, what: string, action: Item['action']) =>
    found.push({ id: `${r.id}:${s.Patient.id}`, rule: r.id, section: r.section as 'Patients', kind: r.kind, who: s.Patient.name, what, patient_id: s.Patient.id, action });
  // Form C is owed even after the guest has gone, so a stay that ended in the last fortnight unfiled still asks.
  const leftUnfiled = await prisma.patientStay.findMany({ where: { form_c_filed: null, end_date: { lt: day, gte: new Date(day.getTime() - 14 * DAY_MS) } }, include: { Patient: { select: { id: true, name: true, country: true } } } });
  // Overdue from the day after it was due, whether or not the guest is still here (#664).
  const formC = (s: { start_date: Date }) => { const due = formCDue(s.start_date); return `Form C ${due < today ? 'overdue since' : 'due by'} ${dayName(due).replace(',', '')}`; };
  for (const s of leftUnfiled) if (isForeign(s.Patient.country)) add(rule('form_c'), s, formC(s), 'card');
  for (const s of stays) {
    if (ymd(s.end_date) === today && !s.discharge) add(rule('leaves_today'), s, 'Leaves today, no discharge summary', 'summary');
    if (hoursIn(s) >= (rule('arrival_open').hours ?? 24) && !s.vitals && !s.concerns && !s.tests) add(rule('arrival_open'), s, 'Arrival steps still open', 'card');
    if (isForeign(s.Patient.country) && !s.form_c_filed) add(rule('form_c'), s, formC(s), 'card');
    if (hoursIn(s) >= (rule('no_diet').hours ?? 24) && !diets.dietFor(s.Patient, true).planName) add(rule('no_diet'), s, 'No diet plan', 'diet');
  }
  // A room taken out of use (#563) with a guest already in it, now or booked: they need another room.
  const inRooms = await prisma.patientStay.findMany({ where: { guest_room_id: { not: null }, on_site: true, end_date: { gte: day } }, include: { Patient: { select: { id: true, name: true } }, GuestRoom: { select: { name: true } } } });
  if (inRooms.length) {
    const off = await prisma.timeOff.findMany({ where: { entity_type: 'guest_room' } });
    for (const s of inRooms) {
      const hit = outNight(off, s.guest_room_id!, s.start_date > day ? s.start_date : day, nightsEnd(s.start_date, s.end_date));
      if (hit) add(rule('room_out'), s, `${s.GuestRoom!.name} is out of use from ${dayName(hit.date).replace(',', '')}${hit.reason ? `: ${hit.reason}` : ''}. Needs another room`, 'card');
    }
  }
  // The doctor's follow-up day (#487): due from that day, for a month, until marked done.
  const left = await prisma.patientStay.findMany({ where: { follow_up_done: null, discharge: { not: Prisma.DbNull }, end_date: { lte: day, gte: new Date(day.getTime() - 400 * DAY_MS) } }, include: { Patient: { select: { id: true, name: true } } } });
  for (const s of left) {
    const due = (s.discharge as { follow_up_date?: string } | null)?.follow_up_date;
    if (due && due <= today && due > ymd(new Date(day.getTime() - 30 * DAY_MS))) add(rule('follow_up'), s, `Follow-up due ${dayName(due).replace(',', '')}`, 'followup');
  }
  // What a guest told the centre on their leaving day (#509), for a week: good and fine in grey, not good counted.
  const told = await prisma.patientStay.findMany({ where: { feedback: { not: Prisma.DbNull }, end_date: { lte: day, gte: new Date(day.getTime() - 7 * DAY_MS) } }, include: { Patient: { select: { id: true, name: true } } } });
  for (const s of told) { const f = s.feedback as { rating: string; note: string }; add(rule(f.rating === 'poor' ? 'feedback_poor' : 'feedback'), s, `${RATING[f.rating] ?? f.rating}${f.note ? `: “${f.note}”` : ''}`, 'card'); }
  for (const s of upcoming) if (!s.discharge) add(rule('leaves_tomorrow'), s, 'Leaves tomorrow, discharge summary not started', 'summary');

  const ctx = await loadDay(day, prisma);
  const away = staffDay(ctx).filter((d) => d.off).map((d) => ({ id: d.staff_id, name: ctx.staff.find((x) => x.id === d.staff_id)?.name ?? '', why: d.off }));
  for (const a of away) found.push({ id: `on_leave:${a.id}`, rule: 'on_leave', section: 'Team', kind: 'information', who: a.name, what: `${a.name} is not in today${a.why ? `: ${a.why}` : ''}` });

  const blocking = (await checkDay(day, prisma, { withFixes: false })).problems.filter((p) => p.problem_class === 'blocking').length;
  return {
    date: today,
    rules: rules.map((r) => ({ ...r, default_on: RULES.find((d) => d.id === r.id)!.on, default_hours: RULES.find((d) => d.id === r.id)!.hours, count: r.id === 'day' ? blocking : found.filter((i) => i.rule === r.id).length })),
    items: found.filter((i) => rule(i.rule).on),
  };
}
