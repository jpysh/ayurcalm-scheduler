import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from './server.js';

const SINGLETON_ID = 'singleton';

/** Roughly 1MB of base64, enough for a logo and small enough to keep in a row. */
const MAX_LOGO_CHARS = 1_400_000;

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const timeString = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Expected HH:MM');

const settingsSchema = z.object({
  centre_name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(400).nullish(),
  timezone: z.string().trim().min(1).max(64),
  opening_time: timeString,
  closing_time: timeString,
  slot_minutes: z.number().int().refine(n => [15, 20, 30, 60].includes(n), 'Expected 15, 20, 30 or 60'),
  working_days: z.array(z.enum(WEEKDAYS)).min(1, 'Pick at least one working day'),
  logo: z.string().max(MAX_LOGO_CHARS).nullish().refine(
    v => !v || v.startsWith('data:image/'),
    'Logo must be a data: URI for an image',
  ),
}).refine(
  v => toMinutes(v.closing_time) > toMinutes(v.opening_time),
  { message: 'Closing time must be after opening time', path: ['closing_time'] },
);

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Reads settings, creating the row with defaults on first access. */
export async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;
  return prisma.settings.create({
    data: {
      id: SINGLETON_ID,
      // Honours CENTRE_NAME on a fresh install so the PDF is right before
      // anyone opens the Settings page.
      centre_name: process.env.CENTRE_NAME || 'Wellness Centre',
    },
  });
}

/** Writes are admin-only; everyone signed in may read. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required' });
    return;
  }
  next();
}

export const settingsRouter = Router();

settingsRouter.get('/', async (_req: Request, res: Response) => {
  res.json(await getSettings());
});

settingsRouter.put('/', requireAdmin, async (req: Request, res: Response) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid settings' });
    return;
  }
  await getSettings();
  const saved = await prisma.settings.update({
    where: { id: SINGLETON_ID },
    data: { ...parsed.data, address: parsed.data.address ?? null, logo: parsed.data.logo ?? null },
  });
  res.json(saved);
});

/**
 * Deletes everything a centre would consider "the demo", leaving user accounts
 * and settings intact so the operator stays signed in. Order matters: rows that
 * reference others go first.
 */
settingsRouter.post('/clear-demo-data', requireAdmin, async (_req: Request, res: Response) => {
  const deleted = await prisma.$transaction(async (tx) => {
    const appointments = await tx.appointment.deleteMany({});
    await tx.dietPlanSegment.deleteMany({});
    await tx.dietPlan.deleteMany({});
    await tx.programEvent.deleteMany({});
    await tx.timeOff.deleteMany({});
    await tx.patientStay.deleteMany({});
    const patients = await tx.patient.deleteMany({});
    const therapies = await tx.therapy.deleteMany({});
    const rooms = await tx.therapyRoom.deleteMany({});
    const staff = await tx.staff.deleteMany({});
    await tx.auditLog.deleteMany({});
    await tx.settings.update({ where: { id: SINGLETON_ID }, data: { demo_data: false } });
    return {
      appointments: appointments.count,
      patients: patients.count,
      staff: staff.count,
      rooms: rooms.count,
      therapies: therapies.count,
    };
  });
  res.json({ ok: true, deleted });
});
