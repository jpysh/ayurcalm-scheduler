import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from './server.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SINGLETON_ID = 'singleton';

/** Roughly 1MB of base64, enough for a logo and small enough to keep in a row. */
const MAX_LOGO_CHARS = 1_400_000;

/**
 * Whoever supports this software by default. Overridable at install time so a
 * fork or a centre with its own support desk is not pointed at ours.
 */
const DEFAULT_SUPPORT_WHATSAPP = process.env.DEFAULT_SUPPORT_WHATSAPP ?? '420777558262';

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const timeString = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Expected HH:MM');

/**
 * A mistyped zone is stored happily and then surfaces much later as a day sheet
 * printed for the wrong day, so it is checked here rather than trusted. Node
 * knows the zone table; asking it is cheaper than shipping our own list.
 */
const isRealTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const settingsSchema = z.object({
  centre_name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(400).nullish(),
  timezone: z.string().trim().min(1).max(64).refine(isRealTimezone, 'Expected an IANA timezone name, such as Asia/Kolkata'),
  opening_time: timeString,
  closing_time: timeString,
  slot_minutes: z.number().int().refine(n => [15, 20, 30, 60].includes(n), 'Expected 15, 20, 30 or 60'),
  working_days: z.array(z.enum(WEEKDAYS)).min(1, 'Pick at least one working day'),
  logo: z.string().max(MAX_LOGO_CHARS).nullish().refine(
    v => !v || v.startsWith('data:image/'),
    'Logo must be a data: URI for an image',
  ),
  // Digits only: wa.me rejects a plus sign, spaces or a leading zero.
  support_whatsapp: z.string().trim().regex(/^\d{8,15}$/, 'Use international format with no + or leading zero, e.g. 420777558262').or(z.literal('')).nullish(),
  patient_support_whatsapp: z.string().trim().regex(/^\d{8,15}$/, 'Use international format with no + or leading zero, e.g. 420777558262').or(z.literal('')).nullish(),
  setup_complete: z.boolean().optional(),
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
      support_whatsapp: DEFAULT_SUPPORT_WHATSAPP || null,
      patient_support_whatsapp: DEFAULT_SUPPORT_WHATSAPP || null,
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
  // A field the caller did not send is left as it is — the setup wizard saves
  // opening hours without touching the support numbers, and must not wipe them.
  // Sending an empty string is how you deliberately clear one.
  const data: Record<string, unknown> = {
    ...parsed.data,
    address: parsed.data.address ?? null,
    logo: parsed.data.logo ?? null,
  };
  for (const key of ['support_whatsapp', 'patient_support_whatsapp'] as const) {
    if (parsed.data[key] === undefined) delete data[key];
    else data[key] = parsed.data[key] || null;
  }
  const saved = await prisma.settings.update({ where: { id: SINGLETON_ID }, data });
  res.json(saved);
});

/**
 * Deletes everything a centre would consider "the demo", leaving user accounts
 * and settings intact so the operator stays signed in. Order matters: rows that
 * reference others go first.
 */
const clearDemoData = () =>
  prisma.$transaction(async (tx) => {
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

settingsRouter.post('/clear-demo-data', requireAdmin, async (_req: Request, res: Response) => {
  res.json({ ok: true, deleted: await clearDemoData() });
});

/**
 * Rebuilds the demo from today, so a test install that has run past its
 * bookings gets a fresh four months. Refused once the demo has been cleared:
 * by then the data is the centre's own.
 */
settingsRouter.post('/reset-demo-data', requireAdmin, async (_req: Request, res: Response) => {
  const settings = await prisma.settings.findUnique({ where: { id: SINGLETON_ID } });
  if (!settings?.demo_data) return res.status(409).json({ error: 'This install holds the centre\'s own data, not demo data' });
  await clearDemoData();
  // The seed is the same script a new install runs; it only fills an empty database.
  const seed = fileURLToPath(new URL('../src/seed.ts', import.meta.url));
  await promisify(execFile)('npx', ['tsx', seed], { cwd: dirname(dirname(seed)), timeout: 10 * 60 * 1000 });
  res.json({ ok: true });
});

/**
 * The only settings a patient may see, on their own unauthenticated page:
 * the centre's name and the contact they should use. Nothing else is exposed.
 */
export const publicSettingsRouter = Router();

publicSettingsRouter.get('/support', async (_req: Request, res: Response) => {
  const settings = await getSettings();
  res.json({
    centre_name: settings.centre_name,
    patient_support_whatsapp: settings.patient_support_whatsapp,
  });
});
