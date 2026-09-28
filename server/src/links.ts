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

const prisma = new PrismaClient();
export const newLinkToken = () => randomBytes(18).toString('base64url');

type Person = { kind: 'therapist' | 'doctor'; id: string; name: string } | { kind: 'patient'; id: string; name: string };
type Record = { checklist?: { [item: string]: boolean }; vitals?: { [field: string]: string }; room_ready?: boolean; feedback?: 'up' | 'down'; feedback_note?: string; feedback_seen?: boolean };
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
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).catch(today).parse(req.query.date);
  const appts = await prisma.appointment.findMany({
    where: { ...mine(who), ...HAPPENING, scheduled_date: new Date(`${date}T00:00:00.000Z`) },
    orderBy: { start_time: 'asc' },
    include: { Therapy: true, Room: { select: { name: true } }, Patient: { select: { name: true } } },
  });
  const staffIds = [...new Set(appts.flatMap((a) => teamOf(a)))];
  const names = new Map((await prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  res.json({
    who: { kind: who.kind, name: who.name },
    centre: settings?.centre_name || 'Wellness Centre',
    date, today,
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
        products: a.Therapy.products, amenities: a.Therapy.required_amenities,
        checklist: ((a.Therapy.checklist || []) as ChecklistItem[]).map((c) => ({ ...c, done: !!record.checklist?.[c.text] })),
        vitals: a.Therapy.vitals.map((f) => ({ field: f, value: record.vitals?.[f] ?? '' })),
        room_ready: !!record.room_ready,
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
      note: text.optional(),
    }).strict().parse(req.body);
    // Only what this therapy asks for: the link is not a free-form store.
    if (body.checklist) record.checklist = { ...record.checklist, ...Object.fromEntries(Object.entries(body.checklist).filter(([k]) => items.includes(k))) };
    if (body.vitals) record.vitals = { ...record.vitals, ...Object.fromEntries(Object.entries(body.vitals).filter(([k]) => a.Therapy.vitals.includes(k))) };
    if (body.room_ready !== undefined) record.room_ready = body.room_ready;
    if (body.note !== undefined) {
      if (who.kind !== 'doctor') { res.status(403).json({ error: 'Only the doctor writes the consultation note.' }); return; }
      notes = body.note || null;
    }
  }
  const updated = await prisma.appointment.update({ where: { id: a.id }, data: { record: record as Prisma.InputJsonValue, ...(notes !== undefined ? { notes } : {}) } });
  res.json({ id: updated.id, record: updated.record, note: updated.notes });
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
