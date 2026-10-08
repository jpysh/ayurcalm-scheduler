import { Router, type Request, type Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { autoSchedule } from './scheduler.js';
import { generateDailySchedulePdf } from './pdf/dailySchedulePdf.js';
import { generateTherapistRotaPdf } from './pdf/therapistRotaPdf.js';
import { generateKitchenSheetPdf } from './pdf/kitchenSheetPdf.js';
import { generateRecordsPdf } from './pdf/recordsPdf.js';
import { renderDischarge } from './pdf/dischargePdf.js';
import { dischargeOf, saveDischarge } from './discharge.js';
import { staffWeek } from './staffWeek.js';
import { newLinkToken } from './links.js';
import { findConflict, HAPPENING, loadDay, nearestFreeTime, oncePerCourse, softWarnings, staffDay, type Action } from './appointmentGuard.js';
import { replanStaffDay, acceptPlan, applyPlan, undoReplan, type Pin } from './replan.js';
import { dietTimeline, startDietFrom, extendDiet } from './patientDiet.js';
import { checkDay, headlineFor, rowOptions } from './dayCheck.js';
import { centreClock, eventClashes, outsideHours, type EventRow } from './availability.js';
import { loadDietsForDay } from './dietResolution.js';
import { bookingOptions, bookingSuggestions, bookingWho, cardChoices, nextConsultations, notStaying, planNextWeek, therapyFacts, whyNoConsultation, whyNoTime } from './cardChoices.js';
import { historyOf } from './history.js';
import { searchPatients, searchTreatments } from './search.js';
import { residentDay } from './residentDay.js';
import { changeLog } from './changeLog.js';
import { therapyLibrary } from './therapyLibrary.js';
import { requireAdmin } from './settings.js';
import { attentionFor, changesSchema } from './attention.js';
import { indiaHolidays } from './indiaHolidays.js';
import { firstFreeRoom, guestRoomRefusal } from './guestRooms.js';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5433/ayurcalm_dev?schema=public';
}

const prismaGlobal = (globalThis as unknown as { __prisma?: PrismaClient }).__prisma;
export const prisma = prismaGlobal ?? new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});
(globalThis as unknown as { __prisma?: PrismaClient }).__prisma = prisma;

export const app = Router();

// Enhanced Health Check with timeout and detailed status
app.get('/health', async (_req: Request, res: Response) => {
  const healthCheck: Record<string, unknown> = {
    ok: true,
    timestamp: new Date().toISOString(),
    service: 'ayurcalm-api',
    checks: {} as Record<string, unknown>,
  };

  // Database health with timeout
  try {
    const dbCheck = await Promise.race([
      prisma.$queryRaw`SELECT 1 as health`.then(() => ({ ok: true })),
      new Promise<{ ok: false; error: string }>((_, reject) =>
        setTimeout(() => reject(new Error('Database health check timeout')), 3000)
      ),
    ]);
    (healthCheck.checks as Record<string, unknown>).database = dbCheck;
  } catch (e) {
    healthCheck.ok = false;
    (healthCheck.checks as Record<string, unknown>).database = {
      ok: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }

  // Memory check
  const memUsage = process.memoryUsage();
  const memCheck = {
    ok: memUsage.heapUsed < 1024 * 1024 * 1024, // < 1GB
    heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
  };
  (healthCheck.checks as Record<string, unknown>).memory = memCheck;
  if (!memCheck.ok) healthCheck.ok = false;

  // Uptime
  (healthCheck as Record<string, unknown>).uptime = process.uptime();

  const statusCode = healthCheck.ok ? 200 : 503;
  res.status(statusCode).json(healthCheck);
});

// Client error capture and fetch
app.post('/client-errors', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    await prisma.auditLog.create({ data: {
      admin_id: String((payload && (payload.user_id || payload.userId)) || 'admin'),
      action: 'client_error',
      entity_type: 'client',
      entity_id: String((payload && (payload.session_id || payload.sessionId)) || 'web'),
      old_value: payload as any,
      new_value: Prisma.JsonNull,
    } });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: 'client error log failed' });
  }
});

app.get('/client-errors', async (req: Request, res: Response) => {
  try {
    const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const list = await prisma.auditLog.findMany({
      where: { action: 'client_error', timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' },
      take: 500,
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'client error fetch failed' });
  }
});

app.get('/client-errors/summary', async (req: Request, res: Response) => {
  try {
    const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const until = req.query.until ? new Date(String(req.query.until)) : new Date();
    const list = await prisma.auditLog.findMany({
      where: { action: 'client_error', timestamp: { gte: since, lte: until } },
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });
    const groups = new Map<string, { count: number; latest: string; sample: any }>();
    for (const item of list) {
      const payload = (item.old_value as any) || {};
      const key = String(payload.message || 'unknown');
      const g = groups.get(key) || { count: 0, latest: item.timestamp.toISOString(), sample: payload };
      g.count++;
      if (new Date(item.timestamp).toISOString() > g.latest) g.latest = new Date(item.timestamp).toISOString();
      groups.set(key, g);
    }
    res.json(Array.from(groups.entries()).map(([message, info]) => ({ message, count: info.count, latest: info.latest, sample: info.sample })));
  } catch (e) {
    res.status(500).json({ error: 'client error summary failed' });
  }
});

// Staff. A doctor's qualification, registration and signature print on the discharge summary.
const doctorFields = {
  qualification: z.string().trim().max(120).nullish(),
  reg_no: z.string().trim().max(60).nullish(),
  signature: z.string().max(400_000).refine((v) => v.startsWith('data:image/'), 'Signature must be an image').nullish(),
};
app.get('/staff', async (_req: Request, res: Response) => {
  const data = await prisma.staff.findMany({ where: { is_active: true } });
  res.json(data);
});

app.post('/staff', async (req: Request, res: Response) => {
  const schema = z.object({
    name: z.string(),
    gender: z.enum(['male', 'female', 'other']),
    specializations: z.array(z.string()).default([]),
    phone: z.string().optional(),
    weekly_schedule: z.record(z.string(), z.any()).default({}),
    role: z.enum(['therapist', 'doctor']).default('therapist'),
    ...doctorFields,
  });
  const body = schema.parse(req.body);
  // A doctor gives consultations and nothing else, whatever the form sent.
  if (body.role === 'doctor') body.specializations = (await prisma.therapy.findMany({ where: { is_consultation: true }, select: { id: true } })).map((t) => t.id);
  const s = await prisma.staff.create({ data: { ...body, name: body.name.trim(), is_active: true } });
  res.status(201).json(s);
});

app.put('/staff/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const schema = z.object({
    name: z.string().optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    specializations: z.array(z.string()).optional(),
    phone: z.string().optional(),
    weekly_schedule: z.record(z.string(), z.any()).optional(),
    is_active: z.boolean().optional(),
    role: z.enum(['therapist', 'doctor']).optional(),
    ...doctorFields,
  });
  const body = schema.parse(req.body);
  const data = { ...body } as any;
  if (data.name) data.name = String(data.name).trim();
  try {
    const s = await prisma.staff.update({ where: { id }, data });
    res.json(s);
  } catch (e) {
    if ((e as any)?.code === 'P2025') {
      res.status(404).json({ error: 'staff not found' });
    } else {
      res.status(400).json({ error: 'staff update failed' });
    }
  }
});

// What new weekly hours would leave outside them (#380), asked before the save; the guard refuses those slots after it.
app.post('/staff/:id/hours-check', async (req: Request, res: Response) => {
  const { weekly_schedule } = z.object({ weekly_schedule: z.record(z.string(), z.any()) }).parse(req.body);
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const clock = centreClock(settings?.timezone || 'Asia/Kolkata');
  const id = req.params.id;
  const ahead = await prisma.appointment.findMany({
    where: { OR: [{ staff_id: id }, { co_staff_ids: { has: id } }], status: { in: ['pending', 'confirmed'] }, scheduled_date: { gte: new Date(`${clock.date}T00:00:00.000Z`) } },
    orderBy: [{ scheduled_date: 'asc' }, { start_time: 'asc' }],
    include: { Patient: { select: { name: true } }, Therapy: { select: { name: true } } },
  });
  res.json({ outside: outsideHours(weekly_schedule, ahead.filter((a) => a.scheduled_date.toISOString().slice(0, 10) > clock.date || a.start_time >= clock.time))
    .map((a) => ({ date: a.scheduled_date.toISOString().slice(0, 10), start_time: a.start_time, patient_name: a.Patient?.name ?? '', therapy_name: a.Therapy?.name ?? '' })) });
});

app.delete('/staff/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appointment.deleteMany({ where: { staff_id: id } });
      await tx.$executeRaw`UPDATE "Appointment" SET "co_staff_ids" = array_remove("co_staff_ids", ${id}) WHERE ${id} = ANY("co_staff_ids")`;
      await tx.timeOff.deleteMany({ where: { entity_type: 'staff', entity_id: id } });
      await tx.staff.update({ where: { id }, data: { is_active: false } });
    });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Rooms
app.get('/rooms', async (_req: Request, res: Response) => {
  const data = await prisma.therapyRoom.findMany({ where: { is_active: true } });
  res.json(data);
});

app.post('/rooms', async (req: Request, res: Response) => {
  const schema = z.object({
    name: z.string(),
    amenities: z.array(z.string()).default([]),
    weekly_schedule: z.record(z.string(), z.any()).default({}),
  });
  const body = schema.parse(req.body);
  const r = await prisma.therapyRoom.create({ data: { ...body, is_active: true } });
  res.status(201).json(r);
});

app.put('/rooms/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const schema = z.object({
    name: z.string().optional(),
    amenities: z.array(z.string()).optional(),
    weekly_schedule: z.record(z.string(), z.any()).optional(),
    is_active: z.boolean().optional(),
  });
  const body = schema.parse(req.body);
  const r = await prisma.therapyRoom.update({ where: { id }, data: body });
  res.json(r);
});

app.delete('/rooms/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appointment.deleteMany({ where: { room_id: id } });
      await tx.timeOff.deleteMany({ where: { entity_type: 'room', entity_id: id } });
      await tx.therapyRoom.update({ where: { id }, data: { is_active: false } });
    });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Therapies
app.get('/therapies', async (_req: Request, res: Response) => {
  const data = await prisma.therapy.findMany();
  res.json(data);
});

app.post('/therapies', async (req: Request, res: Response) => {
  const schema = z.object({
    name: z.string(),
    required_amenities: z.array(z.string()).default([]),
    duration_minutes: z.number().int().positive(),
    requires_gender_match: z.boolean().default(false),
    staff_required: z.number().int().min(1).max(6).default(1),
    description: z.string().optional(),
    is_consultation: z.boolean().default(false),
    once_per_course: z.boolean().default(false),
    before_purification: z.boolean().default(false),
    products: z.array(z.string().max(100)).max(20).default([]),
    checklist: z.array(z.object({ text: z.string().trim().min(1).max(100), required: z.boolean() })).max(20).default([]),
    vitals: z.array(z.string().trim().min(1).max(30)).max(10).default(["bp"]),
  });
  const body = schema.parse(req.body);
  const t = await prisma.therapy.create({ data: body });
  res.status(201).json(t);
});

// The standard library (#219), each marked if the centre already has one of
// that name, so Therapies → Add from library offers only what is missing.
app.get('/therapy-library', async (_req: Request, res: Response) => {
  const have = new Set((await prisma.therapy.findMany({ select: { name: true } })).map((t) => t.name.toLowerCase()));
  res.json(therapyLibrary.map((t) => ({ ...t, added: have.has(t.name.toLowerCase()) })));
});

// Imports the ticked library therapies as the admin edited them. A name the
// centre already has is skipped rather than duplicated.
app.post('/therapies/import', requireAdmin, async (req: Request, res: Response) => {
  const { items } = z.object({ items: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(500).optional(),
    duration_minutes: z.number().int().min(5).max(480),
    staff_required: z.number().int().min(1).max(6).default(1),
    required_amenities: z.array(z.string()).default([]),
    products: z.array(z.string().max(100)).max(20).default([]),
    checklist: z.array(z.object({ text: z.string().trim().min(1).max(100), required: z.boolean() })).max(20).default([]),
    vitals: z.array(z.string().trim().min(1).max(30)).max(10).default(["bp"]),
    requires_gender_match: z.boolean().default(false),
    is_consultation: z.boolean().default(false),
    once_per_course: z.boolean().default(false),
    before_purification: z.boolean().default(false),
  })).min(1).max(100) }).parse(req.body);
  const have = new Set((await prisma.therapy.findMany({ select: { name: true } })).map((t) => t.name.toLowerCase()));
  const fresh = items.filter((t) => !have.has(t.name.toLowerCase()));
  const created = await prisma.$transaction(fresh.map((data) => prisma.therapy.create({ data })));
  res.status(201).json({ created: created.length, skipped: items.length - fresh.length });
});

app.put('/therapies/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const schema = z.object({
    name: z.string().optional(),
    required_amenities: z.array(z.string()).optional(),
    duration_minutes: z.number().int().positive().optional(),
    requires_gender_match: z.boolean().optional(),
    staff_required: z.number().int().min(1).max(6).optional(),
    description: z.string().optional(),
    is_consultation: z.boolean().optional(),
    once_per_course: z.boolean().optional(),
    before_purification: z.boolean().optional(),
    products: z.array(z.string().max(100)).max(20).optional(),
    checklist: z.array(z.object({ text: z.string().trim().min(1).max(100), required: z.boolean() })).max(20).optional(),
    vitals: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  });
  const body = schema.parse(req.body);
  const t = await prisma.therapy.update({ where: { id }, data: body });
  res.json(t);
});

app.delete('/therapies/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appointment.deleteMany({ where: { therapy_id: id } });
      await tx.timeOff.deleteMany({ where: { entity_type: 'therapy', entity_id: id } });
      const affectedStaff = await tx.staff.findMany({ where: { specializations: { has: id } }, select: { id: true, specializations: true } });
      for (const s of affectedStaff) {
        const nextSpecs = (s.specializations || []).filter((sp) => sp !== id);
        await tx.staff.update({ where: { id: s.id }, data: { specializations: nextSpecs } });
      }
      await tx.therapy.delete({ where: { id } });
    });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

/** A stay is whole days: arriving and leaving dates, no times. */
const staySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((s) => s.end_date >= s.start_date, 'Leaving must be on or after arriving');
const stayData = (s: z.infer<typeof staySchema>) => {
  const start_date = new Date(`${s.start_date}T00:00:00.000Z`);
  const end_date = new Date(`${s.end_date}T00:00:00.000Z`);
  return { start_date, end_date, duration_days: Math.round((end_date.getTime() - start_date.getTime()) / 86400000) + 1 };
};

// Patients
app.get('/patients', async (req: Request, res: Response) => {
  const residentOn = req.query.resident_on as string | undefined;
  const where: Prisma.PatientWhereInput = {};
  if (residentOn) {
    // Who is actually staying at the centre on that date. The diet tab wants
    // these and not the whole history of everyone who has ever visited.
    const day = new Date(residentOn);
    // The Patients list also shows who arrives in the next days, so a guest added ahead is not lost (#496).
    const soon = Math.min(Number(req.query.arriving_within) || 0, 60);
    where.Stays = { some: { OR: [{ start_date: { lte: day }, end_date: { gte: day } }, ...(soon ? [{ start_date: { gt: day, lte: new Date(day.getTime() + soon * 86400000) } }] : [])] } };
  }
  // Stays come with each resident, newest first: the list, the card and booking
  // all ask when someone is here, and a stay is the only record of that.
  const data = await prisma.patient.findMany({ where, include: { Stays: { orderBy: { start_date: 'desc' } } } });
  res.json(data);
});

// The Patients search (#285 story 6): by name or by the diet plan they are on, each with the facts a decision needs.
app.get('/patients/find', async (req: Request, res: Response) => {
  const q = z.object({ q: z.string().trim().min(1).max(100), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
  const day = new Date(`${q.date}T00:00:00.000Z`);
  const [patients, diets] = await Promise.all([prisma.patient.findMany({ include: { Stays: { orderBy: { start_date: 'desc' } } } }), loadDietsForDay(day, prisma)]);
  const ql = q.q.toLowerCase();
  const found = patients.map((p) => {
    const stay = p.Stays.find((s) => s.start_date <= day && s.end_date >= day);
    return { p, stay, plan: stay ? diets.dietFor(p, false).planName || '' : '' };
  }).filter((x) => x.p.name.toLowerCase().includes(ql) || x.plan.toLowerCase().includes(ql)).sort((a, b) => Number(!!b.stay) - Number(!!a.stay) || a.p.name.localeCompare(b.p.name)).slice(0, 40);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  res.json({ patients: found.map(({ p, stay, plan }) => ({
    id: p.id, name: p.name, plan,
    stay: stay ? { start: iso(stay.start_date), end: iso(stay.end_date) } : null,
    last_end: stay ? null : p.Stays[0] ? iso(p.Stays[0].end_date) : null,
  })) });
});

app.post('/patients', async (req: Request, res: Response) => {
  const schema = z.object({
    name: z.string(),
    gender: z.enum(['male','female','other']),
    phone: z.string().optional(),
    email: z.string().optional(),
    date_of_birth: z.string().optional(),
    emergency_contact: z.string().optional(),
    emergency_phone: z.string().optional(),
    address: z.string().optional(),
    country: z.string().optional(),
    id_number: z.string().optional(),
    visa_number: z.string().max(100).nullable().optional(),
    visa_valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).nullable().optional(),
    registration_number: z.string().optional(),
    medical_notes: z.string().optional(),
    medication: z.string().max(2000).nullable().optional(),
    before_treatment: z.string().max(2000).nullable().optional(),
    after_treatment: z.string().max(2000).nullable().optional(),
    preferred_staff_id: z.string().uuid().nullable().optional(),
    requires_preferred_staff: z.boolean().optional(),
    /** False for a day patient. */
    on_site: z.boolean().default(true),
    /** The consultation to book with them, as `/consultations/next` offered it; none if left out. */
    consultation: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start_time: z.string().regex(/^\d\d:\d\d$/), staff_id: z.string().uuid(), room_id: z.string().uuid() }).optional(),
    /** Arriving and leaving. Without a stay a resident is never "in house" and never on the day sheet (#142). */
    stay: staySchema.optional(),
    /** The diet plan they follow for the whole stay. */
    template_id: z.string().uuid().optional(),
    /** The guest room the sheet preselected or the admin chose (#456); its type is their accommodation. */
    guest_room_id: z.string().uuid().nullable().optional(),
  });
  const body = schema.parse(req.body);
  const data: any = { name: body.name, gender: body.gender, phone: body.phone, email: body.email, emergency_contact: body.emergency_contact, emergency_phone: body.emergency_phone, address: body.address, country: body.country, id_number: body.id_number, visa_number: body.visa_number, visa_valid_until: body.visa_valid_until || null, registration_number: body.registration_number, medical_notes: body.medical_notes, preferred_staff_id: body.preferred_staff_id, requires_preferred_staff: body.requires_preferred_staff };
  if (body.date_of_birth) data.date_of_birth = new Date(body.date_of_birth);
  // The consultation goes through the same guard as any booking, before anything is saved.
  const visit = body.consultation && body.stay ? body.consultation : null;
  const consult = visit ? await prisma.therapy.findFirst({ where: { is_consultation: true } }) : null;
  if (visit && consult) {
    if (body.stay && (visit.date < body.stay.start_date || visit.date > body.stay.end_date)) { res.status(409).json({ reason: 'NOT_STAYING', message: 'The consultation is outside the stay.' }); return; }
    const day = new Date(`${visit.date}T00:00:00.000Z`);
    const conflict = findConflict({ scheduled_date: day, start_time: visit.start_time, duration_minutes: consult.duration_minutes, staff_id: visit.staff_id, co_staff_ids: [], room_id: visit.room_id, patient_id: '', therapy_id: consult.id }, await loadDay(day, prisma));
    if (conflict) { res.status(409).json(conflict); return; }
  }
  const room = body.guest_room_id && body.stay && body.on_site ? await prisma.guestRoom.findUnique({ where: { id: body.guest_room_id } }) : null;
  if (room && body.stay) {
    const { start_date, end_date } = stayData(body.stay);
    const refused = await guestRoomRefusal(prisma, room.id, start_date, end_date);
    if (refused) { res.status(409).json(refused); return; }
  }
  // One save: the resident, their stay, their diet plan and their consultation, or none of them.
  const p = await prisma.$transaction(async (tx) => {
    const created = await tx.patient.create({ data });
    if (body.stay) {
      const stay = stayData(body.stay);
      await tx.patientStay.create({ data: { patient_id: created.id, ...stay, on_site: body.on_site, ...(room ? { guest_room_id: room.id, accommodation_id: room.accommodation_id } : {}) } });
      if (visit && consult) await tx.appointment.create({ data: { patient_id: created.id, therapy_id: consult.id, staff_id: visit.staff_id, room_id: visit.room_id, scheduled_date: new Date(`${visit.date}T00:00:00.000Z`), start_time: visit.start_time, duration_minutes: consult.duration_minutes, co_staff_ids: [], session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual' } });
      if (body.template_id) await tx.dietPlanSegment.create({ data: { patient_id: created.id, start_date: stay.start_date, end_date: stay.end_date, template_id: body.template_id } });
    }
    return tx.patient.findUnique({ where: { id: created.id }, include: { Stays: true } });
  });
  res.status(201).json(p);
});

app.put('/patients/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const schema = z.object({
    name: z.string().optional(),
    gender: z.enum(['male','female','other']).optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    date_of_birth: z.string().optional(),
    emergency_contact: z.string().optional(),
    emergency_phone: z.string().optional(),
    address: z.string().optional(),
    country: z.string().optional(),
    id_number: z.string().optional(),
    visa_number: z.string().max(100).nullable().optional(),
    visa_valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).nullable().optional(),
    registration_number: z.string().optional(),
    medical_notes: z.string().optional(),
    medication: z.string().max(2000).nullable().optional(),
    before_treatment: z.string().max(2000).nullable().optional(),
    after_treatment: z.string().max(2000).nullable().optional(),
    preferred_staff_id: z.string().uuid().nullable().optional(),
    requires_preferred_staff: z.boolean().optional(),
    doctor_plan: z.string().max(4000).nullable().optional(),
  });
  const body = schema.parse(req.body);
  const data: any = { ...body };
  if (data.visa_valid_until === '') data.visa_valid_until = null;
  if (body.date_of_birth) data.date_of_birth = new Date(body.date_of_birth);
  const prev = await prisma.patient.findUnique({ where: { id } });
  const p = await prisma.patient.update({ where: { id }, data });
  try {
    await prisma.auditLog.create({ data: { admin_id: 'admin', action: 'update', entity_type: 'patient', entity_id: id, old_value: prev as any, new_value: p as any } });
  } catch {}
  res.json(p);
});

app.delete('/patients/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  await prisma.$transaction(async (tx) => {
    const prev = await tx.patient.findUnique({ where: { id } });
    await tx.appointment.deleteMany({ where: { patient_id: id } });
    await tx.dietPlan.deleteMany({ where: { patient_id: id } });
    await tx.dietPlanSegment.deleteMany({ where: { patient_id: id } });
    await tx.patientStay.deleteMany({ where: { patient_id: id } });
    await tx.timeOff.deleteMany({ where: { entity_type: 'patient', entity_id: id } });
    await tx.patient.delete({ where: { id } });
    try {
      await tx.auditLog.create({ data: { admin_id: 'admin', action: 'delete', entity_type: 'patient', entity_id: id, old_value: prev as any, new_value: Prisma.JsonNull } });
    } catch {}
  });
  res.status(204).end();
});

// The Log (#130): the last month's changes, newest first.
app.get('/log', async (req: Request, res: Response) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
  res.json({ entries: await changeLog(days, prisma) });
});

// The resident card (#63): the stay, today's treatments and meals.
app.get('/patients/:id/day', async (req: Request, res: Response) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);
  const out = await residentDay(String(req.params.id), date, prisma);
  if (!out) { res.status(404).json({ error: 'Patient not found' }); return; }
  res.json(out);
});

// Arrival (#219): the first reading, what they came about, tests asked for.
app.patch('/patients/:id/stays/:stayId/arrival', async (req: Request, res: Response) => {
  const text = z.string().max(2000).nullable().optional();
  const body = z.object({ vitals: text, concerns: text, tests: text }).parse(req.body);
  const stay = await prisma.patientStay.findFirst({ where: { id: String(req.params.stayId), patient_id: String(req.params.id) } });
  if (!stay) { res.status(404).json({ error: 'Stay not found' }); return; }
  res.json(await prisma.patientStay.update({ where: { id: stay.id }, data: body }));
});

// The follow-up after discharge (#487): the admin marks it done, or takes that back.
app.patch('/patients/:id/stays/:stayId/follow-up', async (req: Request, res: Response) => {
  const { done } = z.object({ done: z.boolean() }).parse(req.body);
  const stay = await prisma.patientStay.findFirst({ where: { id: String(req.params.stayId), patient_id: String(req.params.id) } });
  if (!stay) { res.status(404).json({ error: 'Stay not found' }); return; }
  res.json(await prisma.patientStay.update({ where: { id: stay.id }, data: { follow_up_done: done ? new Date() : null } }));
});

// Form C (#415): the admin marks it filed with the FRRO, or takes that back.
app.patch('/patients/:id/stays/:stayId/form-c', async (req: Request, res: Response) => {
  const { filed } = z.object({ filed: z.boolean() }).parse(req.body);
  const stay = await prisma.patientStay.findFirst({ where: { id: String(req.params.stayId), patient_id: String(req.params.id) } });
  if (!stay) { res.status(404).json({ error: 'Stay not found' }); return; }
  res.json(await prisma.patientStay.update({ where: { id: stay.id }, data: { form_c_filed: filed ? new Date() : null } }));
});

// Departure: the discharge summary (#194). The doctor writes it from their link
// too; the admin's save may mark it final, which closes it to the link.
const stayOf = (req: Request) => prisma.patientStay.findFirst({ where: { id: String(req.params.stayId), patient_id: String(req.params.id) } });
app.get('/patients/:id/stays/:stayId/discharge', async (req: Request, res: Response) => {
  if (!(await stayOf(req))) { res.status(404).json({ error: 'Stay not found' }); return; }
  res.json(await dischargeOf(String(req.params.stayId), prisma));
});
app.put('/patients/:id/stays/:stayId/discharge', async (req: Request, res: Response) => {
  if (!(await stayOf(req))) { res.status(404).json({ error: 'Stay not found' }); return; }
  await saveDischarge(String(req.params.stayId), req.body, 'admin', prisma);
  res.json(await dischargeOf(String(req.params.stayId), prisma));
});
app.get('/patients/:id/stays/:stayId/discharge-pdf', async (req: Request, res: Response) => {
  const out = (await stayOf(req)) && (await renderDischarge(String(req.params.stayId), prisma));
  if (!out) { res.status(404).json({ error: 'Stay not found' }); return; }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(out.filename)}"`);
  res.send(out.pdf);
});

app.get('/patients/:id/stays', async (req: Request, res: Response) => {
  const id = req.params.id;
  const stays = await prisma.patientStay.findMany({ where: { patient_id: id }, orderBy: { start_date: 'desc' } });
  res.json(stays);
});

app.post('/patients/:id/stays', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  // A returning guest's New stay starts on their last package (#437).
  const { package_id } = z.object({ package_id: z.string().uuid().nullish() }).parse(req.body);
  const created = await prisma.patientStay.create({ data: { patient_id: id, package_id: package_id ?? null, ...stayData(staySchema.parse(req.body)) } });
  res.status(201).json(created);
});

/** What a change to a stay would leave behind: the treatments booked after it now ends. Only this stay's own. */
async function leftOverAfter(patientId: string, stay: { end_date: Date }, newEnd: Date) {
  if (newEnd >= stay.end_date) return [];
  const later = await prisma.patientStay.findFirst({ where: { patient_id: patientId, start_date: { gt: stay.end_date } }, orderBy: { start_date: 'asc' } });
  return prisma.appointment.findMany({
    where: { patient_id: patientId, ...HAPPENING, scheduled_date: { gt: newEnd, ...(later ? { lt: later.start_date } : {}) } },
    include: { Therapy: { select: { name: true } } },
    orderBy: [{ scheduled_date: 'asc' }, { start_time: 'asc' }],
  });
}

// The consequence line before Save (#285 story 10): what a shortened stay would cancel.
app.get('/patients/:id/stays/:stayId/preview', async (req: Request, res: Response) => {
  const stay = await stayOf(req);
  if (!stay) { res.status(404).json({ error: 'Stay not found' }); return; }
  const q = z.object({ end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.query);
  const [from, to] = [q.start_date ? new Date(`${q.start_date}T00:00:00.000Z`) : stay.start_date, new Date(`${q.end_date}T00:00:00.000Z`)];
  const cancels = await leftOverAfter(stay.patient_id, stay, to);
  // New dates re-check the guest room (#456): taken on a night, it says so and names the room the save moves them to.
  const refused = stay.guest_room_id && stay.on_site ? await guestRoomRefusal(prisma, stay.guest_room_id, from, to, stay.id) : null;
  const room = refused && stay.guest_room_id ? await prisma.guestRoom.findUnique({ where: { id: stay.guest_room_id } }) : null;
  const move_to = refused ? (await firstFreeRoom(prisma, from, to, room?.accommodation_id, stay.id)) ?? (await firstFreeRoom(prisma, from, to, null, stay.id)) : null;
  res.json({
    cancels: cancels.map((a) => ({ id: a.id, date: a.scheduled_date.toISOString().slice(0, 10), start_time: a.start_time, therapy_name: a.Therapy.name })),
    room: refused ? { taken: refused.message.slice(0, refused.message.indexOf('.') + 1), move_to: move_to && { id: move_to.id, name: move_to.name, type: move_to.type } } : null,
  });
});

const stayExtras = z.object({
  package_id: z.string().uuid().nullable().optional(),
  accommodation_id: z.string().uuid().nullable().optional(),
  /** The guest room for the whole stay (#456); it sets the accommodation to the room's type. */
  guest_room_id: z.string().uuid().nullable().optional(),
  /** Mark the treatments left after a shortened stay cancelled, "stay shortened", as one batch with one Undo. */
  cancel_after: z.boolean().optional(),
});

/**
 * Change a stay: its dates, and the package and accommodation it chose. A stay that now
 * ends sooner can cancel what is booked after it in the same save: Cancel, not Delete, in
 * one batch, so Undo puts the treatments back. Meals follow the dates: the plan that ran
 * to the old leaving date runs to the new one.
 */
app.put('/patients/:id/stays/:stayId', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const stay = await stayOf(req);
  if (!stay) { res.status(404).json({ error: 'Stay not found' }); return; }
  const extras = stayExtras.parse(req.body);
  const dates = req.body.start_date || req.body.end_date ? stayData(staySchema.parse(req.body)) : { start_date: stay.start_date, end_date: stay.end_date, duration_days: stay.duration_days };
  // The room is checked on every night of the stay as it will be, whether the room or the dates changed.
  const roomId = extras.guest_room_id !== undefined ? extras.guest_room_id : stay.guest_room_id;
  const room = roomId ? await prisma.guestRoom.findUnique({ where: { id: roomId } }) : null;
  if (roomId && stay.on_site) {
    const refused = await guestRoomRefusal(prisma, roomId, dates.start_date, dates.end_date, stay.id);
    if (refused) { res.status(409).json(refused); return; }
  }
  const updated = await prisma.patientStay.update({ where: { id: stay.id }, data: {
    ...dates, package_id: extras.package_id, guest_room_id: extras.guest_room_id,
    accommodation_id: extras.guest_room_id && room ? room.accommodation_id : extras.accommodation_id,
  } });
  await extendDiet(id, stay.end_date, dates.end_date, prisma);
  const left = await leftOverAfter(id, stay, dates.end_date);
  let batch_id: string | null = null;
  let cancelled = 0;
  if (extras.cancel_after && left.length) {
    const out = await applyPlan(left.map((a) => ({ appointment_id: a.id, staff_id: a.staff_id, co_staff_ids: [], room_id: a.room_id, start_time: a.start_time, date: a.scheduled_date.toISOString().slice(0, 10), cancel: true, reason: 'stay shortened' })), prisma);
    batch_id = out.batch_id; cancelled = out.applied;
  }
  res.json({ stay: updated, left_over: extras.cancel_after ? [] : left.map(({ Therapy, ...a }) => a), cancelled, batch_id });
});

// Meals by date (#285 story 7).
app.get('/patients/:id/diet', async (req: Request, res: Response) => {
  const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
  const out = await dietTimeline(String(req.params.id), date, prisma);
  if (!out) { res.status(404).json({ error: 'No stay to plan meals for' }); return; }
  // The patient's own lines beside the plan (#355), edited in the same sheet.
  const own = await prisma.patient.findUnique({ where: { id: String(req.params.id) }, select: { medication: true, before_treatment: true, after_treatment: true } });
  res.json({ ...out, own });
});
app.post('/patients/:id/diet', async (req: Request, res: Response) => {
  const body = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), template_id: z.string().uuid() }).parse(req.body);
  const out = await startDietFrom(String(req.params.id), body.from, body.template_id, prisma);
  if ('error' in out) { res.status(400).json({ error: out.error }); return; }
  res.json(await dietTimeline(String(req.params.id), body.from, prisma));
});

// TimeOff (with Holidays alias)
const timeoffSchema = z.object({
  entity_type: z.enum(['center','staff','room','therapy','patient']),
  entity_id: z.string().uuid().nullable().optional(),
  date: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
  recurrence: z.enum(['weekly']).optional().nullable(),
  weekdays: z.array(z.enum(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'])).optional().nullable(),
  description: z.string().optional().nullable(),
  /** False records the leave and leaves the day for the admin to plan (#285 story 9); absent plans it, as the assistant expects. */
  plan: z.boolean().optional(),
});

const getTimeOffHandler = async (req: Request, res: Response) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  if (from && to) {
    const fromD = new Date(from);
    const toD = new Date(to);
    const baseWhere: Prisma.TimeOffWhereInput = {
      OR: [
        { date: { gte: fromD, lte: toD } },
        { AND: [{ start_date: { lte: toD } }, { end_date: { gte: fromD } }] },
      ],
    };
    const base = await prisma.timeOff.findMany({ where: baseWhere, orderBy: [{ start_date: 'desc' }, { date: 'desc' }] });
    const days: string[] = [];
    for (let d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
      days.push(weekdayNameInTZ(new Date(d)));
    }
    const weeklies = await prisma.timeOff.findMany({ where: { recurrence: 'weekly', weekdays: { hasSome: days } }, orderBy: [{ start_date: 'desc' }, { date: 'desc' }] });
    const filteredWeeklies = weeklies.filter((h) => {
      if (h.start_date && h.end_date) return h.start_date <= toD && h.end_date >= fromD;
      if (h.start_date && !h.end_date) return h.start_date <= toD;
      if (!h.start_date && h.end_date) return h.end_date >= fromD;
      return true;
    });
    const data = [...base, ...filteredWeeklies];
    res.json(data);
    return;
  }
  const data = await prisma.timeOff.findMany({ orderBy: [{ start_date: 'desc' }, { date: 'desc' }] });
  res.json(data);
};

const createTimeOffHandler = async (req: Request, res: Response) => {
  try {
    const { plan, ...body } = timeoffSchema.parse(req.body);
    const data: any = { ...body };
    if (!data.weekdays) data.weekdays = [];
    if (body.date) data.date = new Date(body.date);
    if (body.start_date) data.start_date = new Date(body.start_date);
    if (body.end_date) data.end_date = new Date(body.end_date);
    if (!data.date) {
      if (data.start_date) data.date = new Date(data.start_date);
      else if (data.end_date) data.date = new Date(data.end_date);
      else if (data.recurrence === 'weekly') data.date = new Date();
    }
    const h = await prisma.timeOff.create({ data });

    // Recording an absence is the moment the day has to be rebuilt: the admin
    // is the only person here, and a treatment left on the name of someone who
    // is not coming in prints on the day sheet as though it will happen.
    let replan = null;
    if (h.entity_type === 'staff' && h.entity_id && plan !== false) {
      const days = datesCovered(h);
      const results = [];
      for (const d of days) results.push(await replanStaffDay(h.entity_id, d, prisma, { apply: true, timeOffId: h.id }));
      replan = results.filter((r) => r.moved.length || r.proposed.length || r.unplaced.length);
    }
    res.status(201).json({ ...h, replan });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'TimeOff creation failed' });
  }
};

const deleteTimeOffHandler = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    // Deleting the absence undoes what recording it did: the therapist is
    // coming in after all, so their day goes back as it was.
    const batches = await prisma.auditLog.findMany({ where: { action: 'replan' }, orderBy: { timestamp: 'desc' }, take: 50 });
    for (const b of batches) {
      if ((b.old_value as { time_off_id?: string } | null)?.time_off_id === id) await undoReplan(b.id, prisma);
    }
    // Already gone (undoing its fix can remove it first): the caller's wish is met.
    await prisma.timeOff.deleteMany({ where: { id } });
    res.status(204).end();
  } catch (e) {
    console.error('timeoff delete failed', id, e);
    res.status(500).json({ error: 'Delete failed' });
  }
};

const updateTimeOffHandler = async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    const { plan: _plan, ...body } = timeoffSchema.partial().parse(req.body);
    const data: any = { ...body };
    if (data.weekdays === null) data.weekdays = [];
    if (body.date) data.date = new Date(body.date);
    if (body.start_date) data.start_date = new Date(body.start_date);
    if (body.end_date) data.end_date = new Date(body.end_date);
    const h = await prisma.timeOff.update({ where: { id }, data });
    res.json(h);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'TimeOff update failed' });
  }
};

/** Every date an absence covers, capped at a fortnight: a replan is a day's work. */
const datesCovered = (h: { date: Date | null; start_date: Date | null; end_date: Date | null }) => {
  if (h.start_date && h.end_date) {
    const out: Date[] = [];
    for (const d = new Date(h.start_date); d <= h.end_date && out.length < 14; d.setDate(d.getDate() + 1)) out.push(new Date(d));
    return out;
  }
  return h.date ? [h.date] : [];
};

/** The plan for one therapist's day: what it would do, or what it did. */

/** A row the admin has decided themselves, which the plan must keep. */
const pinSchema = z.object({
  appointment_id: z.string().uuid(),
  staff_id: z.string().uuid().nullable(),
  co_staff_ids: z.array(z.string().uuid()).default([]),
  room_id: z.string().uuid().nullable(),
  start_time: z.string(),
  date: z.string(),
  cancel: z.boolean().optional(),
});

/**
 * What is wrong with one day and the one plan that fixes it — the rulebook the
 * header and Verify both read. The rules are `appointmentGuard` and `planDay`,
 * never a copy of them.
 *
 * `pins` are the rows the admin has changed by hand; the plan is worked out
 * again around them, so what is on the screen is always something that can be
 * accepted whole.
 */
app.post('/day-check', async (req: Request, res: Response) => {
  const body = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    pins: z.array(pinSchema).optional(),
    relax_preferred_staff: z.boolean().optional(),
  }).parse(req.body);
  res.json(await checkDay(new Date(body.date), prisma, {
    pins: body.pins as Pin[] | undefined,
    relaxPreferredStaff: body.relax_preferred_staff,
  }));
});

/** Who is on leave, and when each therapist is tied up, for the schedule's "who is free". */
// Private links (#219): the person's link, made on first ask. ?renew=1 makes a
// new one, which stops the old.
app.post('/staff/:id/link', requireAdmin, async (req: Request, res: Response) => {
  const s = await prisma.staff.findUniqueOrThrow({ where: { id: String(req.params.id) } });
  const token = s.link_token && req.query.renew !== '1' ? s.link_token : (await prisma.staff.update({ where: { id: s.id }, data: { link_token: newLinkToken() } })).link_token;
  // The phone lets the screen offer Send on WhatsApp to this person (#413).
  res.json({ token, phone: s.phone });
});
// A photo of the passport or ID, read from while copying Form C (#510): one per patient, a JPEG shrunk on the phone.
app.get('/patients/:id/passport-photo', requireAdmin, async (req: Request, res: Response) => {
  const photo = await prisma.patientPhoto.findUnique({ where: { patient_id: String(req.params.id) } });
  if (!photo) { res.status(404).json({ error: 'No photo kept.' }); return; }
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(Buffer.from(photo.image));
});
app.put('/patients/:id/passport-photo', requireAdmin, async (req: Request, res: Response) => {
  const image = req.body as Buffer;
  if (!Buffer.isBuffer(image) || image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8) { res.status(400).json({ error: 'Send the photo as a JPEG.' }); return; }
  await prisma.patient.findUniqueOrThrow({ where: { id: String(req.params.id) } });
  const kept = await prisma.patientPhoto.upsert({ where: { patient_id: String(req.params.id) }, create: { patient_id: String(req.params.id), image }, update: { image }, select: { updated_at: true } });
  res.json({ kept: kept.updated_at });
});
app.delete('/patients/:id/passport-photo', requireAdmin, async (req: Request, res: Response) => {
  await prisma.patientPhoto.deleteMany({ where: { patient_id: String(req.params.id) } });
  res.json({ ok: true });
});
app.post('/patients/:id/link', requireAdmin, async (req: Request, res: Response) => {
  const p = await prisma.patient.findUniqueOrThrow({ where: { id: String(req.params.id) } });
  const token = p.link_token && req.query.renew !== '1' ? p.link_token : (await prisma.patient.update({ where: { id: p.id }, data: { link_token: newLinkToken() } })).link_token;
  res.json({ token, phone: p.phone });
});

// Team, read by day (#351): a week from start, each person's hours and booking a day.
app.get('/staff-week', async (req: Request, res: Response) => {
  const start = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.start);
  res.json(await staffWeek(start, prisma));
});

/** What needs the admin (#288): the rules with today's counts, and the patient and team items of those that are on. */
app.get('/attention', async (req: Request, res: Response) => {
  const date = req.query.date ? String(req.query.date).slice(0, 10) : undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: 'date=YYYY-MM-DD required' }); return; }
  res.json(await attentionFor(prisma, date));
});
/** Only what the admin changed is kept; `{}` puts every rule back to its default (Reset). */
app.put('/attention/rules', requireAdmin, async (req: Request, res: Response) => {
  const parsed = changesSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid rules' }); return; }
  await prisma.settings.update({ where: { id: 'singleton' }, data: { attention_rules: parsed.data } });
  res.json(await attentionFor(prisma));
});

app.get('/staff-day', async (req: Request, res: Response) => {
  const date = String(req.query.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: 'date=YYYY-MM-DD required' }); return; }
  res.json(staffDay(await loadDay(new Date(date), prisma)));
});

/** The same thing for the first load, where nothing has been decided yet. */
app.get('/day-check', async (req: Request, res: Response) => {
  const date = String(req.query.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: 'date=YYYY-MM-DD required' }); return; }
  res.json(await checkDay(new Date(date), prisma));
});

/**
 * Which of the coming days have something wrong, for the "check the next 30
 * days?" line. Dates to jump to, not a month of cards.
 */
app.get('/day-check/upcoming', async (req: Request, res: Response) => {
  const from = String(req.query.from || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) { res.status(400).json({ error: 'from=YYYY-MM-DD required' }); return; }
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 60);
  // Only what the server would refuse. A resident with nothing booked three
  // weeks out is not news — the day has not been built yet — and counting those
  // would put "40 things" on every future day and say nothing.
  const out: { date: string; count: number; headline: string | null }[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const check = await checkDay(d, prisma, { withFixes: false });
    const blocking = check.problems.filter((p) => p.problem_class === 'blocking');
    if (blocking.length > 0) out.push({ date: check.date, count: blocking.length, headline: headlineFor(blocking) });
  }
  res.json({ from, days, days_with_problems: out });
});

/** Other ways to place one treatment, when the admin does not like the row. */
app.get('/day-check/options', async (req: Request, res: Response) => {
  const date = String(req.query.date || '').slice(0, 10);
  const id = String(req.query.appointment_id || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !id) { res.status(400).json({ error: 'date and appointment_id required' }); return; }
  res.json({ options: await rowOptions(id, new Date(date), prisma, { relaxPreferredStaff: req.query.relax_preferred_staff === 'true' }) });
});

/**
 * Write the plan the admin confirmed: one batch, one Undo. Every move is put
 * through the same guard a booking goes through, because the plan was worked out
 * a moment ago and the day may have moved since.
 */
app.post('/day-check/accept', async (req: Request, res: Response) => {
  const body = z.object({ date: z.string(), moves: z.array(pinSchema) }).parse(req.body);
  const done = await acceptPlan(body.moves as Pin[], prisma);
  if ('missing' in done) { res.status(404).json({ error: 'Appointment not found' }); return; }
  if ('conflict' in done) { res.status(409).json(done.conflict); return; }
  res.json(done);
});

app.post('/replan', async (req: Request, res: Response) => {
  const schema = z.object({ staff_id: z.string().uuid(), date: z.string(), apply: z.boolean().optional() });
  const body = schema.parse(req.body);
  res.json(await replanStaffDay(body.staff_id, new Date(body.date), prisma, { apply: body.apply }));
});

app.post('/replan/undo', async (req: Request, res: Response) => {
  const body = z.object({ batch_id: z.string().uuid() }).parse(req.body);
  const result = await undoReplan(body.batch_id, prisma);
  if (!result) { res.status(404).json({ error: 'Nothing to undo' }); return; }
  res.json(result);
});

/** What the replan did on a date, for the warning at the top of the dashboard. */
app.get('/replan/summary', async (req: Request, res: Response) => {
  const date = String(req.query.date || '').slice(0, 10);
  const rows = await prisma.auditLog.findMany({ where: { action: 'replan' }, orderBy: { timestamp: 'desc' }, take: 50 });
  const forDate = rows.filter((r) => (r.old_value as { date?: string } | null)?.date === date);
  res.json(forDate.map((r) => ({ batch_id: r.id, at: r.timestamp, ...(r.new_value as object) })));
});

app.get('/timeoff', getTimeOffHandler);
// India's public holidays, for the Leave screen to offer as centre-closed days.
app.get('/holidays/india', (_req: Request, res: Response) => { res.json(indiaHolidays); });
// The consequence line under a leave (#285 story 9): how many treatments the days would leave without their therapist.
app.get('/timeoff/impact', async (req: Request, res: Response) => {
  const q = z.object({ staff_id: z.string().uuid(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
  const treatments = await prisma.appointment.count({
    where: { ...HAPPENING, scheduled_date: { gte: new Date(`${q.from}T00:00:00.000Z`), lte: new Date(`${q.to}T00:00:00.000Z`) }, OR: [{ staff_id: q.staff_id }, { co_staff_ids: { has: q.staff_id } }] },
  });
  res.json({ treatments });
});
app.post('/timeoff', createTimeOffHandler);
app.delete('/timeoff/:id', deleteTimeOffHandler);
app.put('/timeoff/:id', updateTimeOffHandler);

// Aliases for backward compatibility
app.get('/holidays', getTimeOffHandler);
app.post('/holidays', createTimeOffHandler);
app.delete('/holidays/:id', deleteTimeOffHandler);
app.put('/holidays/:id', updateTimeOffHandler);

// Diet Plans
// A DietPlan date is midnight UTC of the calendar day, as the day sheet and the
// seed store it. Accept only YYYY-MM-DD so no time of day can shift the day and
// leave an entry the UI shows but the sheet never prints.
const dietDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

app.get('/dietplans', async (req: Request, res: Response) => {
  const patient_id = req.query.patient_id as string | undefined;
  const date = req.query.date === undefined ? undefined : dietDate.parse(req.query.date);
  const where: Prisma.DietPlanWhereInput = {};
  if (patient_id) where.patient_id = patient_id;
  if (date) where.date = new Date(date);
  res.json(await prisma.dietPlan.findMany({ where }));
});

// Writes one meal for one day. An empty description removes it, so the plan
// applies again. created_by is whoever is signed in, never what the body says.
app.post('/dietplans', async (req: Request, res: Response) => {
  const schema = z.object({
    patient_id: z.string().uuid(),
    date: dietDate,
    meal_time: z.enum(['breakfast','lunch','dinner','snacks']),
    description: z.string().trim().max(500),
    instructions: z.string().trim().max(500).optional(),
  });
  const body = schema.parse(req.body);
  const key = { patient_id: body.patient_id, date: new Date(body.date), meal_time: body.meal_time };
  if (!body.description) {
    await prisma.dietPlan.deleteMany({ where: key });
    res.status(204).end();
    return;
  }
  const fields = { description: body.description, instructions: body.instructions || null, created_by: req.user!.id };
  const dp = await prisma.dietPlan.upsert({
    where: { patient_id_date_meal_time: key },
    create: { ...key, ...fields },
    update: fields,
  });
  res.status(201).json(dp);
});

// Diet Plan Segments
app.get('/dietplans/segments', async (req: Request, res: Response) => {
  const patient_id = req.query.patient_id as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const where: Prisma.DietPlanSegmentWhereInput = {};
  if (patient_id) where.patient_id = patient_id;
  if (from || to) {
    const fromD = from ? new Date(from) : undefined;
    const toD = to ? new Date(to) : undefined;
    where.AND = [
      fromD ? { end_date: { gte: fromD } } : {},
      toD ? { start_date: { lte: toD } } : {},
    ];
  }
  const data = await prisma.dietPlanSegment.findMany({ where, orderBy: { start_date: 'asc' } });
  res.json(data);
});

app.post('/dietplans/segments', async (req: Request, res: Response) => {
  const schema = z.object({
    patient_id: z.string().uuid(),
    start_date: z.string(),
    end_date: z.string(),
    template_id: z.string().uuid().optional(),
    overrides: z.record(z.string(), z.any()).optional(),
    template_label: z.string().optional(),
    therapy_ids: z.array(z.string()).default([]),
    description: z.string().optional(),
  });
  const body = schema.parse(req.body);
  const seg = await prisma.dietPlanSegment.create({ data: {
    patient_id: body.patient_id,
    start_date: new Date(body.start_date),
    end_date: new Date(body.end_date),
    template_id: body.template_id ?? undefined,
    overrides: body.overrides ?? undefined,
    template_label: body.template_label ?? undefined,
    therapy_ids: body.therapy_ids ?? [],
    description: body.description ?? undefined,
  } });
  res.status(201).json(seg);
});

app.put('/dietplans/segments/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const schema = z.object({
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    template_id: z.string().uuid().optional().nullable(),
    overrides: z.record(z.string(), z.any()).optional().nullable(),
    template_label: z.string().optional().nullable(),
    therapy_ids: z.array(z.string()).optional(),
    description: z.string().optional().nullable(),
    patient_id: z.string().uuid().optional(),
  });
  const body = schema.parse(req.body);
  const seg = await prisma.dietPlanSegment.update({ where: { id }, data: {
    patient_id: body.patient_id ?? undefined,
    start_date: body.start_date ? new Date(body.start_date) : undefined,
    end_date: body.end_date ? new Date(body.end_date) : undefined,
    template_id: body.template_id === null ? null : body.template_id ?? undefined,
    overrides: body.overrides === null ? Prisma.JsonNull : body.overrides ?? undefined,
    template_label: body.template_label ?? undefined,
    therapy_ids: body.therapy_ids ?? undefined,
    description: body.description ?? undefined,
  } });
  res.json(seg);
});

app.delete('/dietplans/segments/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  await prisma.dietPlanSegment.delete({ where: { id } });
  res.status(204).end();
});

// Program Events (Daily Program)
app.get('/program-events', async (req: Request, res: Response) => {
  const date = req.query.date as string | undefined;
  if (!date) {
    const all = await prisma.programEvent.findMany();
    res.json(all);
    return;
  }
  const d = new Date(date);
  const dayKey = ymdInTZ(d);
  const weekday = weekdayNameInTZ(d) as 'sunday'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday';
  const all = await prisma.programEvent.findMany();
  const items = all.filter((e) => {
    const isExact = e.date ? ymdInTZ(new Date(e.date)) === dayKey : false;
    const inRange = e.start_date || e.end_date ? (!e.start_date || ymdInTZ(new Date(e.start_date)) <= dayKey) && (!e.end_date || ymdInTZ(new Date(e.end_date)) >= dayKey) : false;
    const weekly = e.recurrence === 'weekly' && Array.isArray(e.weekdays) && e.weekdays.includes(weekday);
    const s = e.start_time || '';
    const inHours = s >= '07:00' && s <= '19:00';
    return inHours && (isExact || inRange || weekly);
  }).sort((a, b) => (a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0));
  res.json(items);
});

/**
 * Refuses an event that would put a therapist in two places at once. Only
 * clashes the save would add count, so editing the name or notes of an event
 * never fails over something that was already there.
 */
async function eventClashRefusal(next: EventRow, before: EventRow | null): Promise<{ error: string; clashes: unknown[] } | null> {
  const today = new Date(new Date().toDateString());
  const appts = await prisma.appointment.findMany({ where: { scheduled_date: { gte: today }, ...HAPPENING } });
  const old = new Set(before ? eventClashes(before, appts).map((a) => a.id) : []);
  const clashes = eventClashes(next, appts).filter((a) => !old.has(a.id));
  if (clashes.length === 0) return null;
  const [staff, patients, therapies] = await Promise.all([prisma.staff.findMany(), prisma.patient.findMany(), prisma.therapy.findMany()]);
  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name || '';
  const lines = clashes
    .sort((m, n) => +m.scheduled_date - +n.scheduled_date || m.start_time.localeCompare(n.start_time))
    .map((a) => `${name(staff, a.staff_id)} has ${name(patients, a.patient_id)}, ${name(therapies, a.therapy_id)} at ${a.start_time} on ${a.scheduled_date.toDateString().slice(0, 10)}`);
  const shown = lines.slice(0, 5).join('; ');
  const more = lines.length > 5 ? `; and ${lines.length - 5} more` : '';
  return {
    error: `This would double-book a therapist: ${shown}${more}. Move those treatments first, or change the therapist or time.`,
    clashes: clashes.map((a) => ({ appointment_id: a.id, date: a.scheduled_date, start_time: a.start_time, staff_id: a.staff_id })),
  };
}

app.post('/program-events', async (req: Request, res: Response) => {
  const schema = z.object({
    date: z.string().optional().nullable(),
    start_date: z.string().optional().nullable(),
    end_date: z.string().optional().nullable(),
    start_time: z.string(),
    end_time: z.string(),
    activity_name: z.string(),
    room_id: z.string().optional().nullable(),
    staff_id: z.string().optional().nullable(),
    required_amenities: z.array(z.string()).optional(),
    notes: z.string().optional().nullable(),
    recurrence: z.string().optional().nullable(),
    weekdays: z.array(z.string()).optional().nullable(),
    audience: z.string().optional().nullable(),
    patients_scope: z.enum(['all','none','custom']).optional().nullable(),
    patient_ids: z.array(z.string()).optional(),
    staff_scope: z.enum(['all','none','custom']).optional().nullable(),
    staff_ids: z.array(z.string()).optional(),
    is_optional: z.boolean().optional(),
  });
  const body = schema.parse(req.body);
  const refusal = await eventClashRefusal({
    date: body.date ? new Date(body.date) : null,
    start_date: body.start_date ? new Date(body.start_date) : null,
    end_date: body.end_date ? new Date(body.end_date) : null,
    start_time: body.start_time, end_time: body.end_time, activity_name: body.activity_name,
    recurrence: body.recurrence || null, weekdays: body.weekdays || [],
    staff_id: body.staff_id || null, staff_scope: body.staff_scope || null, staff_ids: body.staff_ids || [],
  }, null);
  if (refusal) { res.status(409).json(refusal); return; }
  const data = await prisma.programEvent.create({ data: {
    date: body.date ? new Date(body.date) : null,
    start_date: body.start_date ? new Date(body.start_date) : null,
    end_date: body.end_date ? new Date(body.end_date) : null,
    start_time: body.start_time,
    end_time: body.end_time,
    activity_name: body.activity_name,
    room_id: body.room_id || null,
    staff_id: body.staff_id || null,
    required_amenities: body.required_amenities || [],
    notes: body.notes || null,
    recurrence: body.recurrence || null,
    weekdays: body.weekdays || [],
    audience: body.audience || null,
    patients_scope: body.patients_scope || null,
    patient_ids: body.patient_ids || [],
    staff_scope: body.staff_scope || null,
    staff_ids: body.staff_ids || [],
    is_optional: body.is_optional ?? false,
  } });
  res.status(201).json(data);
});

app.put('/program-events/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const schema = z.object({
    date: z.string().optional().nullable(),
    start_date: z.string().optional().nullable(),
    end_date: z.string().optional().nullable(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    activity_name: z.string().optional(),
    room_id: z.string().optional().nullable(),
    staff_id: z.string().optional().nullable(),
    required_amenities: z.array(z.string()).optional(),
    notes: z.string().optional().nullable(),
    recurrence: z.string().optional().nullable(),
    weekdays: z.array(z.string()).optional().nullable(),
    audience: z.string().optional().nullable(),
    patients_scope: z.enum(['all','none','custom']).optional().nullable(),
    patient_ids: z.array(z.string()).optional(),
    staff_scope: z.enum(['all','none','custom']).optional().nullable(),
    staff_ids: z.array(z.string()).optional(),
    is_optional: z.boolean().optional(),
  });
  const body = schema.parse(req.body);
  const before = await prisma.programEvent.findUnique({ where: { id } });
  if (!before) { res.status(404).json({ error: 'Event not found' }); return; }
  const pick = <T,>(v: T | undefined, old: T) => (v === undefined ? old : v);
  const date = (v: string | null | undefined, old: Date | null) => (v === undefined ? old : v ? new Date(v) : null);
  const refusal = await eventClashRefusal({
    date: date(body.date, before.date),
    start_date: date(body.start_date, before.start_date),
    end_date: date(body.end_date, before.end_date),
    start_time: pick(body.start_time, before.start_time),
    end_time: pick(body.end_time, before.end_time),
    activity_name: pick(body.activity_name, before.activity_name),
    recurrence: pick(body.recurrence, before.recurrence),
    weekdays: body.weekdays === null ? [] : pick(body.weekdays, before.weekdays),
    staff_id: pick(body.staff_id, before.staff_id) || null,
    staff_scope: pick(body.staff_scope, before.staff_scope),
    staff_ids: pick(body.staff_ids, before.staff_ids),
  }, before);
  if (refusal) { res.status(409).json(refusal); return; }
  const data = await prisma.programEvent.update({ where: { id }, data: {
    date: body.date === undefined ? undefined : (body.date ? new Date(body.date) : null),
    start_date: body.start_date === undefined ? undefined : (body.start_date ? new Date(body.start_date) : null),
    end_date: body.end_date === undefined ? undefined : (body.end_date ? new Date(body.end_date) : null),
    start_time: body.start_time,
    end_time: body.end_time,
    activity_name: body.activity_name,
    room_id: body.room_id === undefined ? undefined : (body.room_id || null),
    staff_id: body.staff_id === undefined ? undefined : (body.staff_id || null),
    required_amenities: body.required_amenities,
    notes: body.notes === undefined ? undefined : (body.notes || null),
    recurrence: body.recurrence === undefined ? undefined : (body.recurrence || null),
    weekdays: body.weekdays === null ? [] : body.weekdays,
    audience: body.audience === undefined ? undefined : (body.audience || null),
    patients_scope: body.patients_scope === undefined ? undefined : (body.patients_scope || null),
    patient_ids: body.patient_ids,
    staff_scope: body.staff_scope === undefined ? undefined : (body.staff_scope || null),
    staff_ids: body.staff_ids,
    is_optional: body.is_optional,
  } });
  res.json(data);
});

app.delete('/program-events/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  await prisma.programEvent.delete({ where: { id } });
  res.status(204).end();
});

// Daily Schedule PDF. Without `staff_id` this is the centre sheet pinned to the
// notice board; with it, the same day as a therapist rota, filtered to one
// person for whoever works off-site.
app.get('/daily-schedule-pdf', async (req: Request, res: Response) => {
  const date = req.query.date as string | undefined;
  const staffId = typeof req.query.staff_id === 'string' && req.query.staff_id ? req.query.staff_id : undefined;
  const doctors = req.query.view === 'doctor';
  const kitchen = req.query.view === 'kitchen';
  const rota = staffId != null || req.query.view === 'therapist' || doctors;
  if (!date) { res.status(400).json({ error: 'Missing date' }); return; }
  try {
    const pdf = kitchen ? await generateKitchenSheetPdf(date, prisma)
      : rota ? await generateTherapistRotaPdf(date, prisma, staffId, doctors ? 'doctor' : 'therapist')
      : await generateDailySchedulePdf(date, prisma);
    const kind = kitchen ? 'kitchen' : doctors ? 'doctor' : rota ? 'therapist' : 'residents';
    // The centre's own sheets are kept as printed, replacing that day's earlier copy.
    if (!staffId && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const data = { pdf: Buffer.from(pdf), printed_at: new Date() };
      await prisma.printedSheet.upsert({ where: { date_kind: { date, kind } }, update: data, create: { date, kind, ...data } });
      const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      await prisma.printedSheet.deleteMany({ where: { date: { lt: cutoff } } });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ayurcalm-${kitchen ? 'kitchen-sheet' : doctors ? 'doctor-rota' : rota ? 'therapist-rota' : 'daily-schedule'}-${date}.pdf"`);
    res.send(pdf);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to generate PDF';
    res.status(500).json({ error: message });
  }
});

// Records for a month (#488): one PDF an inspector can read.
app.get('/records-pdf', async (req: Request, res: Response) => {
  const { month } = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).parse(req.query);
  const pdf = await generateRecordsPdf(month, prisma);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="records-${month}.pdf"`);
  res.send(pdf);
});

// Printed sheets (#145): the copies kept above, newest day first.
app.get('/printed-sheets', async (_req: Request, res: Response) => {
  res.json(await prisma.printedSheet.findMany({ select: { date: true, kind: true, printed_at: true }, orderBy: [{ date: 'desc' }, { kind: 'asc' }] }));
});
app.get('/printed-sheets/:date/:kind', async (req: Request, res: Response) => {
  const row = await prisma.printedSheet.findUnique({ where: { date_kind: { date: String(req.params.date), kind: String(req.params.kind) } } });
  if (!row) { res.status(404).json({ error: 'No printed copy for that day' }); return; }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="printed-${row.kind}-${row.date}.pdf"`);
  res.send(Buffer.from(row.pdf));
});

// Appointments
app.get('/appointments', async (req: Request, res: Response) => {
  const date = req.query.date as string | undefined;
  const staff_id = req.query.staff_id as string | undefined;
  const patient_id = req.query.patient_id as string | undefined;
  const room_id = req.query.room_id as string | undefined;
  const where: Prisma.AppointmentWhereInput = {};
  if (date) where.scheduled_date = new Date(date);
  // A week in one call, for the week strip (#416).
  const range = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.query);
  if (!date && range.success) where.scheduled_date = { gte: new Date(`${range.data.from}T00:00:00.000Z`), lte: new Date(`${range.data.to}T00:00:00.000Z`) };
  // A therapist's appointments include the ones they assist on.
  if (staff_id) where.OR = [{ staff_id }, { co_staff_ids: { has: staff_id } }];
  if (patient_id) where.patient_id = patient_id;
  if (room_id) where.room_id = room_id;
  const data = await prisma.appointment.findMany({ where });
  if (!date) { res.json(data); return; }
  const dayKey = ymdInTZ(new Date(date));
  const filtered = data.filter((a) => ymdInTZ(new Date(a.scheduled_date)) === dayKey);
  res.json(filtered);
});

app.post('/appointments', async (req: Request, res: Response) => {
  try {
    const result = await autoSchedule(req.body, prisma);
    if (result.success) {
      res.status(201).json(result);
    } else if (result.conflicts?.reason === 'SCHEDULER_TIMEOUT' || result.conflicts?.reason === 'DB_TIMEOUT') {
      res.status(408).json(result);
    } else {
      res.status(409).json(result);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

app.put('/appointments/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const schema = z.object({
    scheduled_date: z.string().optional(),
    start_time: z.string().optional(),
    duration_minutes: z.number().int().positive().optional(),
    staff_id: z.string().uuid().nullable().optional(),
    co_staff_ids: z.array(z.string().uuid()).optional(),
    room_id: z.string().uuid().nullable().optional(),
    status: z.enum(['pending','confirmed','completed','cancelled','rescheduled','no_show']).optional(),
    notes: z.string().optional(),
    patient_id: z.string().uuid().optional(),
    therapy_id: z.string().uuid().optional(),
  });
  const body = schema.parse(req.body);
  const existing = await prisma.appointment.findUnique({ where: { id: String(id) } });
  if (!existing) { res.status(404).json({ error: 'Appointment not found' }); return; }

  const candidate = {
    id: String(id),
    scheduled_date: body.scheduled_date ? new Date(body.scheduled_date) : existing.scheduled_date,
    start_time: body.start_time ?? existing.start_time,
    duration_minutes: body.duration_minutes ?? existing.duration_minutes,
    staff_id: body.staff_id !== undefined ? body.staff_id : existing.staff_id,
    co_staff_ids: body.co_staff_ids ?? existing.co_staff_ids,
    room_id: body.room_id !== undefined ? body.room_id : existing.room_id,
    patient_id: body.patient_id ?? existing.patient_id,
    therapy_id: body.therapy_id ?? existing.therapy_id,
  };

  // Cancelling or completing a treatment moves nobody, so it is never refused.
  const movesIt = body.scheduled_date || body.start_time || body.duration_minutes || body.staff_id !== undefined || body.co_staff_ids !== undefined || body.room_id !== undefined;
  if (movesIt && body.status !== 'cancelled' && body.status !== 'no_show') {
    const ctx = await loadDay(candidate.scheduled_date, prisma);
    const conflict = findConflict(candidate, ctx);
    if (conflict) {
      res.status(409).json({ ...conflict, alternative_start_time: nearestFreeTime(candidate, ctx) });
      return;
    }
  }

  const appt = await prisma.appointment.update({
    where: { id },
    data: {
      ...body,
      scheduled_date: body.scheduled_date ? new Date(body.scheduled_date) : undefined,
    },
  });
  // What changed, for the treatment's History (#136): only the fields sent.
  const before = Object.fromEntries(Object.keys(body).map((k) => [k, (existing as Record<string, unknown>)[k]]));
  await prisma.auditLog.create({ data: { admin_id: 'admin', action: 'update', entity_type: 'appointment', entity_id: id, old_value: before as Prisma.InputJsonValue, new_value: body as Prisma.InputJsonValue } });
  res.json(appt);
});

// The treatment card's lists: what this treatment could change to, each option
// already through the booking guard (#136).
app.get('/appointments/:id/choices', async (req: Request, res: Response) => {
  const kind = z.enum(['time', 'staff', 'room', 'therapy']).parse(req.query.kind);
  const now = typeof req.query.now === 'string' && /^\d\d:\d\d$/.test(req.query.now) ? Number(req.query.now.slice(0, 2)) * 60 + Number(req.query.now.slice(3)) : null;
  const choices = await cardChoices(req.params.id, kind, now, prisma);
  if (!choices) { res.status(404).json({ error: 'Appointment not found' }); return; }
  res.json({ choices });
});

// Search across days (#165). A window either side of the day asked about, so
// "Upcoming" and "Past" are the screen's filter, not a second request.
app.get('/appointments/search', async (req: Request, res: Response) => {
  const query = z.object({
    q: z.string().trim().min(1).max(100),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(req.query);
  const from = new Date(query.from), to = new Date(query.to);
  // The screen sends today ± the same number of days, so the middle is the centre's today.
  const today = new Date((from.getTime() + to.getTime()) / 2);
  today.setUTCHours(0, 0, 0, 0);
  const [hits, patients] = await Promise.all([searchTreatments(query.q, from, to, prisma), searchPatients(query.q, today, prisma)]);
  res.json({ hits, patients });
});

// The + button's suggestions: who to book next, when, with whom, where (#136).
app.get('/appointments/suggest', async (req: Request, res: Response) => {
  const date = String(req.query.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: 'date required' }); return; }
  const now = typeof req.query.now === 'string' && /^\d\d:\d\d$/.test(req.query.now) ? Number(req.query.now.slice(0, 2)) * 60 + Number(req.query.now.slice(3)) : null;
  const pick = z.object({ patient_id: z.string().uuid(), therapy_id: z.string().uuid() }).safeParse(req.query);
  const suggestions = await bookingSuggestions(date, now, prisma, 3, pick.success ? pick.data : undefined);
  res.json({ suggestions, why: pick.success && !suggestions.length ? await whyNoTime(date, pick.data, prisma) : undefined });
});

// The one booking sheet (#285 story 5): who to offer, and the free times, therapists and rooms for the one chosen.
app.get('/appointments/who', async (req: Request, res: Response) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);
  res.json(await bookingWho(date, prisma));
});
app.get('/appointments/options', async (req: Request, res: Response) => {
  const q = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), patient_id: z.string().uuid(), therapy_id: z.string().uuid(), at: z.string().regex(/^\d\d:\d\d$/).optional(), now: z.string().regex(/^\d\d:\d\d$/).optional() }).parse(req.query);
  const out = await bookingOptions(q.date, q.now ? Number(q.now.slice(0, 2)) * 60 + Number(q.now.slice(3)) : null, q, q.at, prisma);
  if (!out) { res.status(404).json({ error: 'Patient or therapy not found' }); return; }
  res.json(out);
});

// The therapy list under the + sheet: each with when they last had it, and any already booked that day (#330).
app.get('/appointments/therapies', async (req: Request, res: Response) => {
  const q = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), patient_id: z.string().uuid() }).parse(req.query);
  res.json({ therapies: await therapyFacts(q.date, q.patient_id, prisma) });
});

// Story 14 (#354): next week, proposed from this week. Book all books every line or none, so the week is never half planned.
app.get('/patients/:id/next-week', async (req: Request, res: Response) => {
  const q = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
  const plan = await planNextWeek(String(req.params.id), q.date, prisma);
  if (!plan) { res.status(404).json({ error: 'Patient not found' }); return; }
  res.json(plan);
});
app.post('/patients/:id/next-week', async (req: Request, res: Response) => {
  const b = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lines: z.array(z.object({ from_therapy_id: z.string().uuid(), therapy_id: z.string().uuid() })).max(12),
    review: z.boolean().default(true),
  }).parse(req.body);
  const id = String(req.params.id);
  const plan = await planNextWeek(id, b.date, prisma, { only: b.lines.map((l) => l.from_therapy_id), swaps: Object.fromEntries(b.lines.map((l) => [l.from_therapy_id, l.therapy_id])), review: b.review });
  if (!plan) { res.status(404).json({ error: 'Patient not found' }); return; }
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
  const missing = plan.lines.flatMap((l) => l.missing.map((m) => `${l.therapy_name} on ${day(m.date)}`));
  if (b.review && plan.review_missing) missing.push('the next review');
  if (missing.length) { res.status(409).json({ message: `Nothing was booked: no free time for ${missing.join(', ')}. Untick or swap it and try again.`, plan }); return; }
  const rows = [
    ...plan.lines.flatMap((l) => l.sessions.map((s, i) => ({ ...s, therapy_id: l.therapy_id, session_number: i + 1, total_sessions: l.sessions.length }))),
    ...(plan.review ? [{ ...plan.review, session_number: 1, total_sessions: 1 }] : []),
  ];
  // ponytail: planned then written without a lock; a booking made in between is caught by nothing. Add a row lock if two admins ever book at once.
  const made = await prisma.$transaction(rows.map(({ date, staff_name: _n, ...r }: typeof rows[number] & { staff_name?: string }) => prisma.appointment.create({
    data: { patient_id: id, therapy_id: r.therapy_id, scheduled_date: new Date(`${date}T00:00:00.000Z`), start_time: r.start_time, duration_minutes: r.duration_minutes, staff_id: r.staff_id, co_staff_ids: r.co_staff_ids, room_id: r.room_id, session_number: r.session_number, total_sessions: r.total_sessions, status: 'confirmed', assignment_type: 'auto' },
  })));
  res.status(201).json({ ids: made.map((a) => a.id), count: made.length });
});

// The consultation a new patient is pre-booked into (#285 story 4): the next free doctor and room.
app.get('/consultations/next', async (req: Request, res: Response) => {
  const q = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), now: z.string().regex(/^\d\d:\d\d$/).optional() }).parse(req.query);
  const slots = await nextConsultations(q.date, q.now ? Number(q.now.slice(0, 2)) * 60 + Number(q.now.slice(3)) : null, prisma);
  res.json({ slots, why: slots.length ? undefined : await whyNoConsultation(prisma) });
});

// Book one treatment at an exact time, therapist and room: what the + sheet
// offered. Put through the same guard as every edit, so it saves only if it fits.
app.post('/appointments/one', async (req: Request, res: Response) => {
  const b = z.object({
    patient_id: z.string().uuid(), therapy_id: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d\d:\d\d$/), staff_id: z.string().uuid(), co_staff_ids: z.array(z.string().uuid()).default([]), room_id: z.string().uuid(),
    // "Book anyway": the daily limit and a repeated therapy are asked about, never refused.
    confirm: z.boolean().default(false),
  }).parse(req.body);
  const therapy = await prisma.therapy.findUnique({ where: { id: b.therapy_id } });
  if (!therapy) { res.status(404).json({ error: 'Therapy not found' }); return; }
  const scheduled_date = new Date(`${b.date}T00:00:00.000Z`);
  const stay = await prisma.patientStay.findFirst({ where: { patient_id: b.patient_id, start_date: { lte: scheduled_date }, end_date: { gte: scheduled_date } } });
  if (!stay) { res.status(409).json({ reason: 'NOT_STAYING', ...(await notStaying(b.patient_id, scheduled_date, prisma)), message: 'This patient is not staying on that day.' }); return; }
  const candidate = { scheduled_date, start_time: b.start_time, duration_minutes: therapy.duration_minutes, staff_id: b.staff_id, co_staff_ids: b.co_staff_ids, room_id: b.room_id, patient_id: b.patient_id, therapy_id: b.therapy_id };
  const ctx = await loadDay(scheduled_date, prisma);
  const conflict = findConflict(candidate, ctx);
  if (conflict) {
    // Every refusal carries a way forward: the nearest time that works, else another therapy.
    const alt = nearestFreeTime(candidate, ctx);
    const actions: Action[] = [alt ? { kind: 'book_at', label: `Book at ${alt}`, date: b.date, start_time: alt } : { kind: 'other_therapy', label: 'Try another therapy' }];
    res.status(409).json({ ...conflict, actions });
    return;
  }
  const once = await oncePerCourse(candidate, prisma);
  const soft = [...softWarnings(candidate, ctx), ...(once ? [once] : [])];
  if (soft.length && !b.confirm) {
    res.status(409).json({ soft: true, reason: soft[0].reason, message: soft.map((w) => w.message).join(' '), warnings: soft, actions: [{ kind: 'book_anyway', label: 'Book anyway' }] });
    return;
  }
  const appt = await prisma.appointment.create({ data: { ...candidate, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual' } });
  // The booked panel says how full their day is now.
  res.status(201).json({ ...appt, day_count: ctx.appointments.filter((a) => a.patient_id === b.patient_id).length + 1 });
});

app.get('/appointments/:id/history', async (req: Request, res: Response) => {
  const entries = await historyOf(req.params.id, prisma);
  if (!entries) { res.status(404).json({ error: 'Appointment not found' }); return; }
  res.json({ entries });
});

app.delete('/appointments/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const prev = await prisma.appointment.findUnique({ where: { id } });
  await prisma.appointment.delete({ where: { id } });
  try {
    await prisma.auditLog.create({ data: { admin_id: 'admin', action: 'delete', entity_type: 'appointment', entity_id: id, old_value: prev as any, new_value: Prisma.JsonNull } });
  } catch {}
  res.status(204).end();
});
const ADMIN_TZ = process.env.ADMIN_TZ || 'Asia/Kolkata';
const ymdInTZ = (date: Date) => {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: ADMIN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value || String(date.getFullYear());
  const m = parts.find((p) => p.type === 'month')?.value || String(date.getMonth() + 1).padStart(2, '0');
  const d = parts.find((p) => p.type === 'day')?.value || String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const weekdayNameInTZ = (date: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: ADMIN_TZ, weekday: 'long' }).format(date).toLowerCase();
