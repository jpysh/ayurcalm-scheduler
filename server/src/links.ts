/**
 * Private links (#219): a therapist, doctor or resident opens their own day
 * from a URL with no sign-in. The token is the only key, so it is long and
 * random, and reissuing it is how the admin revokes one. What a link can do is
 * narrow on purpose: record on its own treatments, raise an issue, never an
 * admin action.
 */
import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PrismaClient, type Prisma } from '@prisma/client';
import { centreClock, teamOf } from './availability.js';
import { loadDay, staffDay } from './appointmentGuard.js';
import { loadDietsForDay, mealLabel, mealOrder } from './dietResolution.js';
import { lastReadings } from './residentDay.js';
import { dischargeOf, saveDischarge } from './discharge.js';
import { renderDischarge } from './pdf/dischargePdf.js';

const prisma = new PrismaClient();
export const newLinkToken = () => randomBytes(18).toString('base64url');

type Person = { kind: 'therapist' | 'doctor'; id: string; name: string } | { kind: 'patient'; id: string; name: string };
type Record = { checklist?: { [item: string]: boolean }; vitals?: { [field: string]: string }; room_ready?: boolean; /** The centre's clock when the therapist ticked Done (#522). */ done?: string; feedback?: 'up' | 'down'; feedback_note?: string; feedback_seen?: boolean };
type ChecklistItem = { text: string; required: boolean };

async function personOf(token: string): Promise<Person | null> {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const s = await prisma.staff.findUnique({ where: { link_token: token } });
  if (s?.is_active) return { kind: s.role === 'doctor' ? 'doctor' : 'therapist', id: s.id, name: s.name };
  const p = await prisma.patient.findUnique({ where: { link_token: token } });
  return p ? { kind: 'patient', id: p.id, name: p.name } : null;
}

const HAPPENING: Prisma.AppointmentWhereInput = { status: { notIn: ['cancelled'] } };
const mine = (who: Person): Prisma.AppointmentWhereInput =>
  who.kind === 'patient' ? { patient_id: who.id } : { OR: [{ staff_id: who.id }, { co_staff_ids: { has: who.id } }] };

export const linkRouter = Router();

// A mistyped or revoked link reads the same as one that never existed.
const gone = (res: Response) => res.status(404).json({ error: 'This link is no longer valid. Ask the centre for a new one.' });

linkRouter.get('/:token', async (req: Request, res: Response) => {
  const who = await personOf(String(req.params.token));
  if (!who) return gone(res);
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const today = centreClock(settings?.timezone || 'Asia/Kolkata').date;
  // A guest not here yet opens on their first day, and is told when it is, not shown an empty today (#498).
  const next = who.kind === 'patient' ? await prisma.patientStay.findFirst({ where: { patient_id: who.id, end_date: { gte: new Date(`${today}T00:00:00.000Z`) } }, orderBy: { start_date: 'asc' } }) : null;
  const arrives = next && next.start_date.toISOString().slice(0, 10) > today ? next.start_date.toISOString().slice(0, 10) : null;
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).catch(arrives ?? today).parse(req.query.date);
  const appts = await prisma.appointment.findMany({
    where: { ...mine(who), ...HAPPENING, scheduled_date: new Date(`${date}T00:00:00.000Z`) },
    orderBy: { start_time: 'asc' },
    include: { Therapy: true, Room: { select: { name: true } }, Patient: { select: { name: true } } },
  });
  const staffIds = [...new Set(appts.flatMap((a) => teamOf(a)))];
  const names = new Map((await prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  const day = new Date(`${date}T00:00:00.000Z`);
  // A free day says why (#424): a therapist's day off, and a patient's meals even with no treatment.
  const off = who.kind === 'patient' ? null : staffDay(await loadDay(day, prisma)).find((d) => d.staff_id === who.id)?.off || null;
  let meals: { meal: string; text: string }[] = [];
  if (who.kind === 'patient') {
    const patient = await prisma.patient.findUnique({ where: { id: who.id }, include: { Stays: { where: { start_date: { lte: day }, end_date: { gte: day } } } } });
    if (patient?.Stays.length) {
      const diet = (await loadDietsForDay(day, prisma)).dietFor(patient, appts.length > 0);
      meals = mealOrder.filter((m) => diet.meals[m]).map((m) => ({ meal: mealLabel[m], text: diet.meals[m]! }));
    }
  }
  // On the leaving day, and for a week after, the guest is asked how the stay was, once (#509).
  const ended = who.kind === 'patient' ? await prisma.patientStay.findFirst({ where: { patient_id: who.id, start_date: { lte: new Date(`${today}T00:00:00.000Z`) }, end_date: { lte: new Date(`${today}T00:00:00.000Z`), gte: new Date(Date.parse(`${today}T00:00:00.000Z`) - 7 * 86400000) } }, orderBy: { end_date: 'desc' } }) : null;
  // A patient fills their own details before arriving (#489): what the card's More details holds.
  const details = who.kind === 'patient' ? await prisma.patient.findUnique({ where: { id: who.id }, select: DETAILS }) : null;
  res.json({
    who: { kind: who.kind, name: who.name },
    ...(details ? { details: { ...details, date_of_birth: details.date_of_birth?.toISOString().slice(0, 10) ?? null } } : {}),
    centre: settings?.centre_name || 'Wellness Centre',
    date, today, arrives, off, meals,
    feedback: ended ? { given: (ended.feedback as { rating: string; note: string } | null) ?? null } : null,
    items: appts.map((a) => {
      const record = (a.record || {}) as Record;
      const base = {
        id: a.id, start_time: a.start_time, duration_minutes: a.duration_minutes, status: a.status,
        therapy: a.Therapy.name, description: a.Therapy.description, room: a.Room?.name ?? null,
      };
      // A resident sees their own schedule and their thumbs; nothing the staff record.
      if (who.kind === 'patient') return { ...base, with: teamOf(a).map((id) => names.get(id) || ''), feedback: record.feedback ?? null, feedback_note: record.feedback_note ?? null };
      return {
        ...base,
        patient: a.Patient.name,
        with: teamOf(a).filter((id) => id !== who.id).map((id) => names.get(id) || ''),
        products: a.Therapy.products, amenities: a.Therapy.required_amenities.map((x) => x.replace(/_/g, " ")),
        checklist: ((a.Therapy.checklist || []) as ChecklistItem[]).map((c) => ({ ...c, done: !!record.checklist?.[c.text] })),
        vitals: a.Therapy.vitals.map((f) => ({ field: f, value: record.vitals?.[f] ?? '' })),
        room_ready: !!record.room_ready,
        done: record.done ?? null,
        ...(who.kind === 'doctor' ? { note: a.notes } : {}),
      };
    }),
  });
});

const text = z.string().trim().max(1000);
linkRouter.post('/:token/appointments/:id', async (req: Request, res: Response) => {
  const who = await personOf(String(req.params.token));
  if (!who) return gone(res);
  const a = await prisma.appointment.findFirst({ where: { id: String(req.params.id), ...mine(who) }, include: { Therapy: true } });
  if (!a) { res.status(404).json({ error: 'Not one of your treatments.' }); return; }
  const record = { ...((a.record || {}) as Record) };
  let notes: string | null | undefined;
  if (who.kind === 'patient') {
    const body = z.object({ feedback: z.enum(['up', 'down']).nullable().optional(), feedback_note: text.optional() }).strict().parse(req.body);
    if (body.feedback !== undefined) { record.feedback = body.feedback ?? undefined; record.feedback_seen = false; }
    if (body.feedback_note !== undefined) record.feedback_note = body.feedback_note || undefined;
  } else {
    const items = ((a.Therapy.checklist || []) as ChecklistItem[]).map((c) => c.text);
    const body = z.object({
      checklist: z.record(z.string(), z.boolean()).optional(),
      vitals: z.record(z.string(), z.string().trim().max(40)).optional(),
      room_ready: z.boolean().optional(),
      done: z.boolean().optional(),
      note: text.optional(),
    }).strict().parse(req.body);
    // Only what this therapy asks for: the link is not a free-form store.
    if (body.checklist) record.checklist = { ...record.checklist, ...Object.fromEntries(Object.entries(body.checklist).filter(([k]) => items.includes(k))) };
    if (body.vitals) record.vitals = { ...record.vitals, ...Object.fromEntries(Object.entries(body.vitals).filter(([k]) => a.Therapy.vitals.includes(k))) };
    if (body.room_ready !== undefined) record.room_ready = body.room_ready;
    if (body.done !== undefined) {
      const zone = (await prisma.settings.findUnique({ where: { id: 'singleton' } }))?.timezone || 'Asia/Kolkata';
      record.done = body.done ? record.done ?? centreClock(zone).time : undefined;
    }
    if (body.note !== undefined) {
      if (who.kind !== 'doctor') { res.status(403).json({ error: 'Only the doctor writes the consultation note.' }); return; }
      notes = body.note || null;
    }
  }
  const updated = await prisma.appointment.update({ where: { id: a.id }, data: { record: record as Prisma.InputJsonValue, ...(notes !== undefined ? { notes } : {}) } });
  res.json({ id: updated.id, record: updated.record, note: updated.notes });
});

const DETAILS = { phone: true, email: true, date_of_birth: true, address: true, country: true, id_number: true, emergency_contact: true, emergency_phone: true } as const;
const field = z.string().trim().max(200);
linkRouter.put('/:token/details', async (req: Request, res: Response) => {
  const who = await personOf(String(req.params.token));
  if (!who) return gone(res);
  if (who.kind !== 'patient') { res.status(403).json({ error: 'Only a patient fills their own details.' }); return; }
  const b = z.object({
    phone: field, email: field, address: z.string().trim().max(500), country: field, id_number: field, emergency_contact: field, emergency_phone: field,
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')),
  }).partial().strict().parse(req.body);
  const { date_of_birth, ...rest } = b;
  const saved = await prisma.patient.update({ where: { id: who.id }, select: DETAILS, data: { ...rest, ...(date_of_birth !== undefined ? { date_of_birth: date_of_birth ? new Date(`${date_of_birth}T00:00:00.000Z`) : null } : {}) } });
  // The Log says who changed what: a guest's own save is one of those (#499). Which fields, never their values.
  await prisma.auditLog.create({ data: { admin_id: 'guest', action: 'write', entity_type: 'patients', entity_id: who.id, new_value: { method: 'PUT', path: `/patients/${who.id}/details`, body: { fields: Object.keys(b) } } } }).catch(() => { /* the save itself succeeded */ });
  res.json(saved);
});

// One question on the leaving day (#509): a face and an optional line, kept on the stay and read by the admin in What needs you.
linkRouter.post('/:token/feedback', async (req: Request, res: Response) => {
  const who = await personOf(String(req.params.token));
  if (!who) return gone(res);
  if (who.kind !== 'patient') { res.status(403).json({ error: 'Only a guest answers this.' }); return; }
  const b = z.object({ rating: z.enum(['good', 'fine', 'poor']), note: z.string().trim().max(500).default('') }).strict().parse(req.body);
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const today = new Date(`${centreClock(settings?.timezone || 'Asia/Kolkata').date}T00:00:00.000Z`);
  const stay = await prisma.patientStay.findFirst({ where: { patient_id: who.id, start_date: { lte: today }, end_date: { lte: today, gte: new Date(today.getTime() - 7 * 86400000) } }, orderBy: { end_date: 'desc' } });
  if (!stay) { res.status(404).json({ error: 'There is no stay to answer about yet.' }); return; }
  await prisma.patientStay.update({ where: { id: stay.id }, data: { feedback: { ...b, at: new Date().toISOString() } } });
  res.json({ ok: true });
});

export const ISSUE_KINDS = ['room', 'co_therapist', 'patient_absent', 'sos', 'permission', 'note'] as const;
linkRouter.post('/:token/issues', async (req: Request, res: Response) => {
  const who = await personOf(String(req.params.token));
  if (!who) return gone(res);
  if (who.kind === 'patient') { res.status(403).json({ error: 'Issues come from the team.' }); return; }
  const body = z.object({ kind: z.enum(ISSUE_KINDS), note: text.optional(), appointment_id: z.string().uuid().optional() }).strict().parse(req.body);
  if (body.appointment_id && !(await prisma.appointment.findFirst({ where: { id: body.appointment_id, ...mine(who) } }))) {
    res.status(404).json({ error: 'Not one of your treatments.' }); return;
  }
  res.status(201).json(await prisma.linkIssue.create({ data: { staff_id: who.id, kind: body.kind, note: body.note || null, appointment_id: body.appointment_id ?? null } }));
});

// The doctor writes the discharge summary from their link (#194): residents
// leaving within three days either side of today. Once the admin marks one
// final it reads but no longer saves.
const DAY_MS = 86400000;
async function doctorOf(req: Request, res: Response) {
  const who = await personOf(String(req.params.token));
  if (!who) { gone(res); return null; }
  if (who.kind !== 'doctor') { res.status(403).json({ error: 'Only a doctor writes discharge summaries.' }); return null; }
  return who;
}
linkRouter.get('/:token/discharges', async (req: Request, res: Response) => {
  if (!(await doctorOf(req, res))) return;
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const today = new Date(`${centreClock(settings?.timezone || 'Asia/Kolkata').date}T00:00:00.000Z`);
  const stays = await prisma.patientStay.findMany({
    where: { end_date: { gte: new Date(today.getTime() - 3 * DAY_MS), lte: new Date(today.getTime() + 3 * DAY_MS) } },
    orderBy: { end_date: 'asc' }, include: { Patient: { select: { name: true } } },
  });
  res.json(stays.map((s) => ({ stay_id: s.id, name: s.Patient.name, to: s.end_date.toISOString().slice(0, 10), saved: !!s.discharge, final: !!(s.discharge as { final?: boolean } | null)?.final })));
});
linkRouter.get('/:token/discharges/:stayId', async (req: Request, res: Response) => {
  if (!(await doctorOf(req, res))) return;
  const v = await dischargeOf(String(req.params.stayId), prisma);
  if (!v) { res.status(404).json({ error: 'Stay not found' }); return; }
  res.json(v);
});
linkRouter.put('/:token/discharges/:stayId', async (req: Request, res: Response) => {
  const who = await doctorOf(req, res);
  if (!who) return;
  const out = await saveDischarge(String(req.params.stayId), req.body, 'doctor', prisma, who.id);
  if ('error' in out) { res.status(out.error ?? 404).json({ error: out.error === 409 ? 'The centre has made this summary final. Ask them to change it.' : 'Stay not found' }); return; }
  res.json(await dischargeOf(String(req.params.stayId), prisma));
});
linkRouter.get('/:token/discharges/:stayId/pdf', async (req: Request, res: Response) => {
  if (!(await doctorOf(req, res))) return;
  const out = await renderDischarge(String(req.params.stayId), prisma);
  if (!out) { res.status(404).json({ error: 'Stay not found' }); return; }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(out.filename)}"`);
  res.send(out.pdf);
});

// The doctor's round (#423): patients in house today whose review is due — a
// consultation booked today, or none in the last seven days and none ahead —
// each with the last note. The plan the doctor writes here is the patient's
// plan the admin books from (Plan next week shows it as the doctor's plan).
linkRouter.get('/:token/round', async (req: Request, res: Response) => {
  if (!(await doctorOf(req, res))) return;
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const todayISO = centreClock(settings?.timezone || 'Asia/Kolkata').date;
  const today = new Date(`${todayISO}T00:00:00.000Z`);
  const stays = await prisma.patientStay.findMany({ where: { start_date: { lte: today }, end_date: { gt: today } }, include: { Patient: true } });
  const consults = await prisma.appointment.findMany({
    where: { patient_id: { in: stays.map((s) => s.patient_id) }, ...HAPPENING, Therapy: { is_consultation: true } },
    orderBy: [{ scheduled_date: 'asc' }, { start_time: 'asc' }], include: { Staff: { select: { name: true } } },
  });
  const weekAgo = new Date(today.getTime() - 7 * DAY_MS);
  const round = stays.flatMap((s) => {
    const mineAll = consults.filter((c) => c.patient_id === s.patient_id);
    const booked = mineAll.find((c) => c.scheduled_date.getTime() === today.getTime());
    const before = mineAll.filter((c) => c.scheduled_date < today);
    const last = before[before.length - 1];
    const ahead = mineAll.some((c) => c.scheduled_date > today);
    if (!booked && (ahead || (last && last.scheduled_date > weekAgo))) return [];
    const noted = [...before].reverse().find((c) => c.notes?.trim());
    return [{
      patient_id: s.patient_id, name: s.Patient.name,
      day: Math.round((today.getTime() - s.start_date.getTime()) / DAY_MS) + 1,
      days: Math.round((s.end_date.getTime() - s.start_date.getTime()) / DAY_MS) + 1,
      booked: booked ? { start_time: booked.start_time, doctor: booked.Staff?.name ?? null } : null,
      last: noted ? { date: noted.scheduled_date.toISOString().slice(0, 10), note: noted.notes } : null,
      plan: s.Patient.doctor_plan,
    }];
  });
  // What the doctor needs to decide the week (#530): the last readings, the week's treatments by therapy, the diet.
  // ponytail: three small queries a patient due today; one query per kind for the whole round if a centre has hundreds in house.
  const given = await prisma.appointment.findMany({
    where: { patient_id: { in: round.map((r) => r.patient_id) }, scheduled_date: { gte: new Date(today.getTime() - 6 * DAY_MS), lte: today }, status: { notIn: ['cancelled', 'no_show'] }, Therapy: { is_consultation: false } },
    select: { patient_id: true, Therapy: { select: { name: true } } },
  });
  const diets = await loadDietsForDay(today, prisma);
  const patients = new Map(stays.map((s) => [s.patient_id, s.Patient]));
  const facts = new Map(await Promise.all(round.map(async (r) => {
    const counts = new Map<string, number>();
    for (const a of given) if (a.patient_id === r.patient_id) counts.set(a.Therapy.name, (counts.get(a.Therapy.name) ?? 0) + 1);
    return [r.patient_id, {
      readings: (await lastReadings(r.patient_id, today, prisma)).map((x) => `${x.text} · ${x.date}`),
      treatments: [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', '),
      diet: diets.dietFor(patients.get(r.patient_id)!, true).planName || null,
    }] as const;
  })));
  res.json(round.map((r) => ({ ...r, facts: facts.get(r.patient_id) })).sort((a, b) => (a.booked?.start_time ?? '99').localeCompare(b.booked?.start_time ?? '99') || a.name.localeCompare(b.name)));
});
linkRouter.put('/:token/round/:patientId', async (req: Request, res: Response) => {
  if (!(await doctorOf(req, res))) return;
  const { plan } = z.object({ plan: z.string().trim().max(4000) }).strict().parse(req.body);
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const today = new Date(`${centreClock(settings?.timezone || 'Asia/Kolkata').date}T00:00:00.000Z`);
  // Only a patient in house: the link is not a way into every record.
  const stay = await prisma.patientStay.findFirst({ where: { patient_id: String(req.params.patientId), start_date: { lte: today }, end_date: { gte: today } } });
  if (!stay) { res.status(404).json({ error: 'Not in house today.' }); return; }
  const p = await prisma.patient.update({ where: { id: stay.patient_id }, data: { doctor_plan: plan || null } });
  res.json({ patient_id: p.id, plan: p.doctor_plan });
});
