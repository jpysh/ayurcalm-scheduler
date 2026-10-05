import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { exportCentre, importCentre, ImportRefused } from './transfer.js';
import { z } from 'zod';
import { prisma } from './server.js';
import { wipeDemo, KEEPABLE, type Keep } from './demoData.js';
import { letterheadSchema } from './discharge.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { DEMO, nextReset } from './demo.js';
import { trialInfo } from './trial.js';
import { madeWith } from './product.js';
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } from './auth.js';

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
  enforce_gender_match: z.boolean().optional(),
  max_treatments_per_day: z.number().int().min(1).max(12).optional(),
  show_footer: z.boolean().optional(),
  letterhead: letterheadSchema.optional(),
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

// The setup card (#288): an item is reviewed once the admin has opened it; nothing here blocks anything.
export const SETUP_ITEMS = ['hours', 'rules', 'centre', 'catalogues', 'people'] as const;
settingsRouter.put('/setup-reviewed', requireAdmin, async (req: Request, res: Response) => {
  const parsed = z.object({ item: z.enum(SETUP_ITEMS) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Unknown setup item' }); return; }
  const { setup_reviewed } = await getSettings();
  const saved = await prisma.settings.update({ where: { id: SINGLETON_ID }, data: { setup_reviewed: [...new Set([...setup_reviewed, parsed.data.item])] } });
  res.json({ setup_reviewed: saved.setup_reviewed });
});

const clearDemoData = (keep: Keep[] = []) => prisma.$transaction((tx) => wipeDemo(tx, keep), { timeout: 120000 });

// `keep` names what stays (#108); "templates" is the wizard's therapies and rooms.
settingsRouter.post('/clear-demo-data', requireAdmin, async (req: Request, res: Response) => {
  const { keep } = z.object({ keep: z.union([z.literal('templates'), z.array(z.enum(KEEPABLE))]).optional() }).parse(req.body ?? {});
  res.json({ ok: true, deleted: await clearDemoData(keep === 'templates' ? ['therapies', 'rooms'] : keep) });
});

/**
 * Rebuilds the demo from today, so a test install that has run past its
 * bookings gets a fresh four months. Refused once the demo has been cleared:
 * by then the data is the centre's own.
 */
export async function resetDemo() {
  const settings = await prisma.settings.findUnique({ where: { id: SINGLETON_ID } });
  if (!settings?.demo_data) return false;
  await clearDemoData();
  // The seed is the same script a new install runs; it only fills an empty database.
  const seed = fileURLToPath(new URL('../src/seed.ts', import.meta.url));
  await promisify(execFile)('npx', ['tsx', seed], { cwd: dirname(dirname(seed)), timeout: 10 * 60 * 1000 });
  return true;
}
settingsRouter.post('/reset-demo-data', requireAdmin, async (_req: Request, res: Response) => {
  if (!(await resetDemo())) return res.status(409).json({ error: 'This install holds the centre\'s own data, not demo data' });
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
    // Only the centre's own number: while it is still the maintainer's (the default), residents are not sent there (#273 M1).
    patient_support_whatsapp: settings.patient_support_whatsapp && settings.patient_support_whatsapp !== settings.support_whatsapp ? settings.patient_support_whatsapp : null,
    trial: await trialInfo(),
    made_with: madeWith(settings),
    ...(DEMO && { demo: { email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD, next_reset: nextReset() } }),
  });
});

// Backups (#236): the backup service writes into /backups; the admin sees the
// newest and can take a copy off the machine from their phone.
const BACKUPS = process.env.BACKUP_PATH || '/backups';
async function backupFiles() {
  const names = (await readdir(BACKUPS).catch(() => [] as string[])).filter((n) => /^ayurcalm-\d{8}-\d{4}\.sql\.gz$/.test(n)).sort().reverse();
  return Promise.all(names.map(async (name) => ({ name, ...(({ size, mtime }) => ({ size, at: mtime }))(await stat(join(BACKUPS, name))) })));
}
// A backup is the whole database: a handful of downloads an hour is plenty.
const backupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 60 });
settingsRouter.get('/backups', backupLimiter, requireAdmin, async (_req: Request, res: Response) => {
  const files = await backupFiles();
  res.json({ count: files.length, latest: files[0] ?? null });
});
settingsRouter.get('/backups/latest', backupLimiter, requireAdmin, async (_req: Request, res: Response) => {
  const [latest] = await backupFiles();
  if (!latest) { res.status(404).json({ error: 'No backup yet' }); return; }
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${latest.name}"`);
  createReadStream(join(BACKUPS, latest.name)).pipe(res);
});

// Moving a centre between installs (#231): one file out, one file in.
settingsRouter.get('/export', backupLimiter, requireAdmin, async (_req: Request, res: Response) => {
  const day = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="ayurcalm-export-${day}.json.gz"`);
  res.send(await exportCentre(prisma));
});
settingsRouter.post('/import', backupLimiter, requireAdmin, express.raw({ type: () => true, limit: '200mb' }), async (req: Request, res: Response) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) { res.status(400).json({ error: 'Choose an export file.' }); return; }
  try {
    res.json({ ok: true, imported: await importCentre(req.body, prisma) });
  } catch (e) {
    if (e instanceof ImportRefused) { res.status(409).json({ error: e.message }); return; }
    throw e;
  }
});
