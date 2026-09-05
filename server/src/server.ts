import { Router, type Request, type Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { autoSchedule } from './scheduler.js';
import { generateDailySchedulePdf } from './pdf/dailySchedulePdf.js';

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

// User feedback capture and fetch
app.post('/feedback', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const created = await prisma.auditLog.create({ data: {
      admin_id: String((payload && (payload.user_id || payload.userId)) || 'anonymous'),
      action: 'user_feedback',
      entity_type: 'client',
      entity_id: String((payload && (payload.page || payload.url)) || 'web'),
      old_value: payload as any,
      new_value: { status: 'submitted' } as any,
    } });
    res.status(201).json({ id: created.id });
  } catch (e) {
    res.status(500).json({ error: 'feedback log failed' });
  }
});

app.get('/feedback', async (req: Request, res: Response) => {
  try {
    const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const list = await prisma.auditLog.findMany({
      where: { action: 'user_feedback', timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' },
      take: 500,
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'feedback fetch failed' });
  }
});

app.get('/feedback/summary', async (req: Request, res: Response) => {
  try {
    const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const until = req.query.until ? new Date(String(req.query.until)) : new Date();
    const list = await prisma.auditLog.findMany({
      where: { action: 'user_feedback', timestamp: { gte: since, lte: until } },
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });
    const groups = new Map<string, { count: number; latest: string; sample: any }>();
    for (const item of list) {
      const payload = (item.old_value as any) || {};
      const key = String(`${payload.page || 'unknown'}::${(payload.message || '').slice(0, 60)}`);
      const g = groups.get(key) || { count: 0, latest: item.timestamp.toISOString(), sample: payload };
      g.count++;
      if (new Date(item.timestamp).toISOString() > g.latest) g.latest = new Date(item.timestamp).toISOString();
      groups.set(key, g);
    }
    res.json(Array.from(groups.entries()).map(([k, info]) => ({ key: k, count: info.count, latest: info.latest, sample: info.sample })));
  } catch (e) {
    res.status(500).json({ error: 'feedback summary failed' });
  }
});

// User feedback status update
app.put('/feedback/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const schema = z.object({
      status: z.enum(['submitted','eta','done']),
      eta_date: z.string().optional(),
    });
    const body = schema.parse(req.body);
    const existing = await prisma.auditLog.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'feedback not found' });
      return;
    }
    const prevNew = (existing.new_value as any) || {};
    const nextNew = { ...prevNew, status: body.status, eta_date: body.eta_date } as any;
    const updated = await prisma.auditLog.update({ where: { id }, data: { new_value: nextNew } });
    res.json({ id: updated.id, new_value: updated.new_value });
  } catch (e) {
    res.status(400).json({ error: 'feedback status update failed' });
  }
});

// Staff
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
    weekly_schedule: z.record(z.any()).default({}),
  });
  const body = schema.parse(req.body);
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
    weekly_schedule: z.record(z.any()).optional(),
    is_active: z.boolean().optional(),
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

app.delete('/staff/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appointment.deleteMany({ where: { staff_id: id } });
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
    weekly_schedule: z.record(z.any()).default({}),
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
    weekly_schedule: z.record(z.any()).optional(),
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
    description: z.string().optional(),
  });
  const body = schema.parse(req.body);
  const t = await prisma.therapy.create({ data: body });
  res.status(201).json(t);
});

app.put('/therapies/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const schema = z.object({
    name: z.string().optional(),
    required_amenities: z.array(z.string()).optional(),
    duration_minutes: z.number().int().positive().optional(),
    requires_gender_match: z.boolean().optional(),
    description: z.string().optional(),
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

// Patients
app.get('/patients', async (req: Request, res: Response) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const where: Prisma.PatientWhereInput = {};
  if (from || to) {
    // intersect availability with requested window
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    where.AND = [
      fromDate ? { OR: [{ available_from: null }, { available_from: { lte: fromDate } }] } : {},
      toDate ? { OR: [{ available_to: null }, { available_to: { gte: toDate } }] } : {},
    ];
  }
  const data = await prisma.patient.findMany({ where });
  res.json(data);
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
    medical_notes: z.string().optional(),
    diet_plan: z.string().optional(),
    available_from: z.string().optional(),
    available_to: z.string().optional(),
  });
  const body = schema.parse(req.body);
  const data: any = { name: body.name, gender: body.gender, phone: body.phone, email: body.email, emergency_contact: body.emergency_contact, emergency_phone: body.emergency_phone, medical_notes: body.medical_notes, diet_plan: body.diet_plan };
  if (body.available_from) data.available_from = new Date(body.available_from);
  if (body.available_to) data.available_to = new Date(body.available_to);
  if (body.date_of_birth) data.date_of_birth = new Date(body.date_of_birth);
  const p = await prisma.patient.create({ data });
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
    medical_notes: z.string().optional(),
    diet_plan: z.string().optional(),
    available_from: z.string().optional(),
    available_to: z.string().optional(),
  });
  const body = schema.parse(req.body);
  const data: any = { ...body };
  if (body.available_from) data.available_from = new Date(body.available_from);
  if (body.available_to) data.available_to = new Date(body.available_to);
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
    await tx.patientStay.deleteMany({ where: { patient_id: id } });
    await tx.timeOff.deleteMany({ where: { entity_type: 'patient', entity_id: id } });
    await tx.patient.delete({ where: { id } });
    try {
      await tx.auditLog.create({ data: { admin_id: 'admin', action: 'delete', entity_type: 'patient', entity_id: id, old_value: prev as any, new_value: Prisma.JsonNull } });
    } catch {}
  });
  res.status(204).end();
});

app.get('/patients/:id/stays', async (req: Request, res: Response) => {
  const id = req.params.id;
  const stays = await prisma.patientStay.findMany({ where: { patient_id: id }, orderBy: { start_date: 'desc' } });
  res.json(stays);
});

app.post('/patients/:id/stays', async (req: Request, res: Response) => {
  const id = req.params.id;
  const schema = z.object({ start_date: z.string(), end_date: z.string() });
  const body = schema.parse(req.body);
  const start = new Date(body.start_date);
  const end = new Date(body.end_date);
  const sDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const eDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const ms = eDay.getTime() - sDay.getTime();
  const days = Math.max(1, Math.floor(ms / 86400000) + 1);
  const created = await prisma.patientStay.create({ data: { patient_id: id, start_date: sDay, end_date: eDay, duration_days: days } });
  res.status(201).json(created);
});

// Maintenance: merge and delete duplicate patients by name
app.post('/patients/cleanup-duplicates', async (_req: Request, res: Response) => {
  const patients = await prisma.patient.findMany();
  const byName = new Map<string, typeof patients>();
  for (const p of patients) {
    const key = p.name.trim().toLowerCase();
    const arr = byName.get(key) || [];
    arr.push(p);
    byName.set(key, arr);
  }
  let patientsDeleted = 0;
  let apptsReassigned = 0;
  let dietsReassigned = 0;
  let timeoffsDeleted = 0;
  let groupsProcessed = 0;
  for (const group of byName.values()) {
    if (group.length <= 1) continue;
    groupsProcessed++;
    // keep earliest created_at
    const sorted = [...group].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const primary = sorted[0];
    const duplicates = sorted.slice(1);
    await prisma.$transaction(async (tx) => {
      for (const dup of duplicates) {
        const apptUpdate = await tx.appointment.updateMany({ where: { patient_id: dup.id }, data: { patient_id: primary.id } });
        apptsReassigned += apptUpdate.count;
        const dietUpdate = await tx.dietPlan.updateMany({ where: { patient_id: dup.id }, data: { patient_id: primary.id } });
        dietsReassigned += dietUpdate.count;
        const toDel = await tx.timeOff.deleteMany({ where: { entity_type: 'patient', entity_id: dup.id } });
        timeoffsDeleted += toDel.count;
        await tx.patient.delete({ where: { id: dup.id } });
        patientsDeleted++;
      }
    });
  }
  res.json({ groupsProcessed, patientsDeleted, apptsReassigned, dietsReassigned, timeoffsDeleted });
});

// Maintenance: randomize availability for test purposes over next 3 months
app.post('/patients/randomize-availability', async (_req: Request, res: Response) => {
  const patients = await prisma.patient.findMany();
  const now = new Date();
  const threeMonths = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
  const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const p of patients) {
      const startOffsetDays = randInt(0, 90);
      const start = new Date(now);
      start.setDate(now.getDate() + startOffsetDays);
      const durationDays = randInt(1, 60);
      const end = new Date(start);
      end.setDate(start.getDate() + durationDays);
      // cap end within three months
      if (end > threeMonths) {
        end.setTime(threeMonths.getTime());
      }
      await tx.patient.update({ where: { id: p.id }, data: { available_from: start, available_to: end } });
      updated++;
    }
  });
  res.json({ updated });
});

// Maintenance: one-time update to set end date for all current patients
app.post('/patients/set-end-date-2025-12-31-23-59', async (_req: Request, res: Response) => {
  const target = new Date('2025-12-31T23:59:00');
  const result = await prisma.patient.updateMany({ data: { available_to: target } });
  res.json({ updated: result.count, available_to: target.toISOString() });
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
    const body = timeoffSchema.parse(req.body);
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
    res.status(201).json(h);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'TimeOff creation failed' });
  }
};

const deleteTimeOffHandler = async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    await prisma.timeOff.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: 'Delete failed' });
  }
};

const updateTimeOffHandler = async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    const body = timeoffSchema.partial().parse(req.body);
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

app.get('/timeoff', getTimeOffHandler);
app.post('/timeoff', createTimeOffHandler);
app.delete('/timeoff/:id', deleteTimeOffHandler);
app.put('/timeoff/:id', updateTimeOffHandler);

// Aliases for backward compatibility
app.get('/holidays', getTimeOffHandler);
app.post('/holidays', createTimeOffHandler);
app.delete('/holidays/:id', deleteTimeOffHandler);
app.put('/holidays/:id', updateTimeOffHandler);

// Diet Plans
app.get('/dietplans', async (req: Request, res: Response) => {
  const patient_id = req.query.patient_id as string | undefined;
  const date = req.query.date as string | undefined;
  const where: Prisma.DietPlanWhereInput = {};
  if (patient_id) where.patient_id = patient_id;
  if (date) where.date = new Date(date);
  const data = await prisma.dietPlan.findMany({ where });
  if (!date) { res.json(data); return; }
  const dayKey = ymdInTZ(new Date(date));
  const filtered = data.filter((d) => ymdInTZ(new Date(d.date)) === dayKey);
  res.json(filtered);
});

app.post('/dietplans', async (req: Request, res: Response) => {
  const schema = z.object({
    patient_id: z.string().uuid(),
    date: z.string(),
    meal_time: z.enum(['breakfast','lunch','dinner','snacks']),
    description: z.string(),
    instructions: z.string().optional(),
    created_by: z.string().uuid(),
  });
  const body = schema.parse(req.body);
  const dp = await prisma.dietPlan.create({ data: { ...body, date: new Date(body.date) } });
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
    template: z.record(z.any()).optional(),
    template_label: z.string().optional(),
    therapy_ids: z.array(z.string()).default([]),
    description: z.string().optional(),
  });
  const body = schema.parse(req.body);
  const seg = await prisma.dietPlanSegment.create({ data: {
    patient_id: body.patient_id,
    start_date: new Date(body.start_date),
    end_date: new Date(body.end_date),
    template: body.template ?? undefined,
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
    template: z.record(z.any()).optional().nullable(),
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
    template: body.template === null ? Prisma.JsonNull : body.template ?? undefined,
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
  });
  const body = schema.parse(req.body);
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
  });
  const body = schema.parse(req.body);
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
  } });
  res.json(data);
});

app.delete('/program-events/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  await prisma.programEvent.delete({ where: { id } });
  res.status(204).end();
});

// Daily Schedule PDF
app.get('/daily-schedule-pdf', async (req: Request, res: Response) => {
  const date = req.query.date as string | undefined;
  if (!date) { res.status(400).json({ error: 'Missing date' }); return; }
  try {
    const pdf = await generateDailySchedulePdf(date, prisma);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ayurcalm-daily-schedule-${date}.pdf"`);
    res.send(pdf);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to generate PDF';
    res.status(500).json({ error: message });
  }
});

// Appointments
app.get('/appointments', async (req: Request, res: Response) => {
  const date = req.query.date as string | undefined;
  const staff_id = req.query.staff_id as string | undefined;
  const patient_id = req.query.patient_id as string | undefined;
  const room_id = req.query.room_id as string | undefined;
  const where: Prisma.AppointmentWhereInput = {};
  if (date) where.scheduled_date = new Date(date);
  if (staff_id) where.staff_id = staff_id;
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

app.delete('/appointments', async (req: Request, res: Response) => {
  const date = req.query.date as string | undefined;
  const where: Prisma.AppointmentWhereInput = {};
  if (date) where.scheduled_date = new Date(date);
  const result = await prisma.appointment.deleteMany({ where });
  res.json({ deleted: result.count });
});

// Maintenance: remove duplicate bookings for same patient/time on a date
app.post('/appointments/cleanup', async (req: Request, res: Response) => {
  const schema = z.object({ date: z.string().optional() });
  const body = schema.parse(req.body);
  const where: Prisma.AppointmentWhereInput = {};
  if (body.date) where.scheduled_date = new Date(body.date);
  const appts = await prisma.appointment.findMany({ where });
  const byKey = new Map<string, typeof appts>();
  for (const a of appts) {
    const day = new Date(a.scheduled_date).toISOString().slice(0,10);
    const key = `${a.patient_id}|${day}|${a.start_time}`;
    const arr = byKey.get(key) || [];
    arr.push(a);
    byKey.set(key, arr);
  }
  let deleted = 0;
  for (const arr of byKey.values()) {
    if (arr.length > 1) {
      // keep first, delete the rest
      const toDelete = arr.slice(1);
      for (const a of toDelete) {
        await prisma.appointment.delete({ where: { id: a.id } });
        deleted++;
      }
    }
  }
  res.json({ deleted });
});

// Maintenance: merge and deactivate duplicate staff by name and delete their time offs
app.post('/staff/cleanup-duplicates', async (_req: Request, res: Response) => {
  const staff = await prisma.staff.findMany();
  const byName = new Map<string, typeof staff>();
  for (const s of staff) {
    const key = s.name.trim().toLowerCase();
    const arr = byName.get(key) || [];
    arr.push(s);
    byName.set(key, arr);
  }
  let groupsProcessed = 0;
  let staffDeactivated = 0;
  let apptsReassigned = 0;
  let timeoffsDeleted = 0;
  for (const group of byName.values()) {
    if (group.length <= 1) continue;
    groupsProcessed++;
    // pick primary as the one with most appointments, fallback to smallest id
    const counts = await Promise.all(group.map(async (s) => ({ id: s.id, count: await prisma.appointment.count({ where: { staff_id: s.id } }) })));
    const sorted = [...group].sort((a, b) => {
      const ca = counts.find((c) => c.id === a.id)?.count ?? 0;
      const cb = counts.find((c) => c.id === b.id)?.count ?? 0;
      if (ca !== cb) return cb - ca;
      return a.id.localeCompare(b.id);
    });
    const primary = sorted[0];
    const duplicates = sorted.slice(1);
    await prisma.$transaction(async (tx) => {
      for (const dup of duplicates) {
        const apptUpdate = await tx.appointment.updateMany({ where: { staff_id: dup.id }, data: { staff_id: primary.id } });
        apptsReassigned += apptUpdate.count;
        const toDel = await tx.timeOff.deleteMany({ where: { entity_type: 'staff', entity_id: dup.id } });
        timeoffsDeleted += toDel.count;
        await tx.staff.update({ where: { id: dup.id }, data: { is_active: false } });
        staffDeactivated++;
      }
    });
  }
  res.json({ groupsProcessed, staffDeactivated, apptsReassigned, timeoffsDeleted });
});

// Maintenance: normalize business hours for center/staff time off
app.post('/timeoff/normalize-business-hours', async (_req: Request, res: Response) => {
  const list = await prisma.timeOff.findMany({ where: { entity_type: { in: ['center','staff'] } } });
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const h of list) {
      const startDay = h.start_date ?? h.date ?? h.end_date ?? null;
      const endDay = h.end_date ?? h.start_date ?? h.date ?? null;
      const start = startDay ? new Date(startDay) : null;
      const end = endDay ? new Date(endDay) : null;
      if (start) start.setHours(9, 0, 0, 0);
      if (end) end.setHours(18, 0, 0, 0);
      const data: Prisma.TimeOffUpdateInput = {
        start_date: start ?? undefined,
        end_date: end ?? undefined,
        start_time: '09:00',
        end_time: '18:00',
      };
      await tx.timeOff.update({ where: { id: h.id }, data });
      updated++;
    }
  });
  res.json({ updated });
});

// Maintenance: rename active rooms to Rm1, Rm2, ... (stable order by id)
app.post('/rooms/rename-simple', async (_req: Request, res: Response) => {
  const rooms = await prisma.therapyRoom.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } });
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < rooms.length; i++) {
      const desired = `Rm${i + 1}`;
      if (rooms[i].name === desired) continue;
      await tx.therapyRoom.update({ where: { id: rooms[i].id }, data: { name: desired } });
      updated++;
    }
  });
  res.json({ updated, total: rooms.length });
});

app.put('/appointments/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const schema = z.object({
    scheduled_date: z.string().optional(),
    start_time: z.string().optional(),
    duration_minutes: z.number().int().positive().optional(),
    staff_id: z.string().uuid().nullable().optional(),
    room_id: z.string().uuid().nullable().optional(),
    status: z.enum(['pending','confirmed','completed','cancelled','rescheduled']).optional(),
    notes: z.string().optional(),
    patient_id: z.string().uuid().optional(),
    therapy_id: z.string().uuid().optional(),
  });
  const body = schema.parse(req.body);
  const appt = await prisma.appointment.update({
    where: { id },
    data: {
      ...body,
      scheduled_date: body.scheduled_date ? new Date(body.scheduled_date) : undefined,
    },
  });
  res.json(appt);
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
