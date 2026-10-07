/**
 * AyurCalm over MCP: the centre's day, read from the admin's own AI assistant
 * (#119, spec in #102), and a day re-planned on the admin's yes (#120). The
 * tools call the same functions the screens and the day sheet call, and decide
 * nothing themselves.
 *
 * Tools are grouped by what they act on, each with an `action`, so the list
 * stays short as later issues add writes (#120, #121, #124, #125).
 */
import { PRODUCT } from './product.js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod';
import { prisma } from './server.js';
import { requireAdmin } from './settings.js';
import { findConflict, loadDay, nearestFreeTime, staffDay } from './appointmentGuard.js';
import { activeEventsOnDay, gives, toMinutes, type EventRow } from './availability.js';
import { checkDay, rowOptions } from './dayCheck.js';
import { acceptPlan, planDay, undoReplan, type Pin } from './replan.js';
import { loadDietsForDay } from './dietResolution.js';
import { generateDailySchedulePdf } from './pdf/dailySchedulePdf.js';
import { generateTherapistRotaPdf } from './pdf/therapistRotaPdf.js';

// ---------------------------------------------------------------- the key

const hash = (key: string) => createHash('sha256').update(key).digest();

/** The one AI key. Only its hash is kept; downloading again replaces it. */
async function issueKey(userId: string): Promise<string> {
  const key = `acm_${randomBytes(32).toString('base64url')}`;
  await prisma.serverSecret.update({
    where: { id: 'singleton' },
    data: { mcp_key_hash: hash(key).toString('hex'), mcp_key_user_id: userId, mcp_key_created_at: new Date(), mcp_key_last_used_at: null },
  });
  return key;
}

/** Lets a request through to /mcp only with the current key. Never logs it. */
async function requireMcpKey(req: Request, res: Response, next: NextFunction) {
  const header = String(req.headers.authorization || '');
  const key = header.startsWith('Bearer ') ? header.slice(7) : '';
  const row = key ? await prisma.serverSecret.findUnique({ where: { id: 'singleton' } }) : null;
  const stored = row?.mcp_key_hash ? Buffer.from(row.mcp_key_hash, 'hex') : null;
  if (!stored || !timingSafeEqual(stored, hash(key))) {
    res.status(401).json({ error: `${PRODUCT} key missing or revoked. Download the extension again from Settings.` });
    return;
  }
  const user = row!.mcp_key_user_id ? await prisma.user.findUnique({ where: { id: row!.mcp_key_user_id } }) : null;
  if (!user || !user.is_active) {
    res.status(401).json({ error: 'The admin who connected this assistant no longer exists.' });
    return;
  }
  await prisma.serverSecret.update({ where: { id: 'singleton' }, data: { mcp_key_last_used_at: new Date() } });
  next();
}

// ---------------------------------------------------------------- the extension

const here = path.dirname(fileURLToPath(import.meta.url));
// Kept as plain JavaScript beside the TypeScript, because it runs inside Claude
// Desktop, not in this container. Read from src/ so the build needs no copy step.
const proxySource = () => readFileSync(path.resolve(here, '../src/mcpb/proxy.cjs'));

/** A zip, which is all an .mcpb is. Stored deflated, one directory level. */
function zip(files: { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const body = zlib.deflateRawSync(f.data);
    const name = Buffer.from(f.name);
    const crc = zlib.crc32(f.data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6); head.writeUInt16LE(8, 8);
    head.writeUInt32LE(0, 10); head.writeUInt32LE(crc, 14); head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(f.data.length, 22); head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
    local.push(head, name, body);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(8, 10); dir.writeUInt32LE(0, 12); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(f.data.length, 24); dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += head.length + name.length + body.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

function buildExtension(url: string, key: string, centreName: string): Buffer {
  const manifest = {
    manifest_version: '0.3',
    name: 'ayurcalm',
    display_name: `${PRODUCT} — ${centreName}`,
    version: '1.0.0',
    description: "Your centre's day, residents, therapists and day sheet, from Claude.",
    author: { name: PRODUCT },
    server: {
      type: 'node',
      entry_point: 'server/index.cjs',
      mcp_config: { command: 'node', args: ['${__dirname}/server/index.cjs'], env: { AYURCALM_URL: url, AYURCALM_KEY: key } },
    },
  };
  return zip([
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) },
    { name: 'server/index.cjs', data: proxySource() },
  ]);
}

/** Settings → Connect Claude Desktop. Admin only, behind the normal login. */
export const mcpKeyRouter = Router();

mcpKeyRouter.get('/', async (_req: Request, res: Response) => {
  const row = await prisma.serverSecret.findUnique({ where: { id: 'singleton' } });
  res.json({ connected: Boolean(row?.mcp_key_hash), created_at: row?.mcp_key_created_at ?? null, last_used_at: row?.mcp_key_last_used_at ?? null });
});

mcpKeyRouter.post('/extension', requireAdmin, async (req: Request, res: Response) => {
  const key = await issueKey(req.user!.id);
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  // The address the admin's browser used is the one Claude Desktop, on the same
  // machine, can reach.
  const url = `${req.protocol}://${req.get('host')}/mcp`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${PRODUCT}.mcpb"`);
  res.send(buildExtension(url, key, settings?.centre_name || 'Wellness Centre'));
});

mcpKeyRouter.delete('/', requireAdmin, async (_req: Request, res: Response) => {
  await prisma.serverSecret.update({ where: { id: 'singleton' }, data: { mcp_key_hash: null, mcp_key_user_id: null, mcp_key_created_at: null, mcp_key_last_used_at: null } });
  res.json({ connected: false });
});

// ---------------------------------------------------------------- reading the day

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD, in the centre\'s timezone. Call centre with action "today" first if you need today.');
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const endOf = (start: string, minutes: number) => hhmm(toMinutes(start) + minutes);
const dayOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function centreNow() {
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const tz = settings?.timezone || 'Asia/Kolkata';
  const now = new Date();
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...o }).format(now);
  return {
    date: part({ year: 'numeric', month: '2-digit', day: '2-digit' }),
    time: part({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    weekday: new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long' }).format(now),
    timezone: tz,
    centre_name: settings?.centre_name || 'Wellness Centre',
  };
}

/** One day, grouped by resident as the day sheet groups it. */
async function readDay(date: string) {
  const day = dayOf(date);
  const [ctx, stays, diets] = await Promise.all([
    loadDay(day, prisma),
    prisma.patientStay.findMany({ where: { start_date: { lte: day }, end_date: { gte: day } } }),
    loadDietsForDay(day, prisma),
  ]);
  const staffName = new Map(ctx.staff.map((s) => [s.id, s.name]));
  const person = (id: string) => ({ id, name: staffName.get(id) || 'Unknown therapist' });
  const room = new Map(ctx.rooms.map((r) => [r.id, r.name]));
  const therapy = new Map(ctx.therapies.map((t) => [t.id, t.name]));
  const stayOf = new Map(stays.map((s) => [s.patient_id, s]));
  const treatmentsOf = (patientId: string) =>
    ctx.appointments
      .filter((a) => a.patient_id === patientId)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((a) => ({
        treatment_id: a.id,
        start_time: a.start_time,
        end_time: endOf(a.start_time, a.duration_minutes),
        therapy: therapy.get(a.therapy_id) || 'Treatment',
        team: { lead: a.staff_id ? person(a.staff_id) : null, others: a.co_staff_ids.map(person) },
        room: a.room_id ? { id: a.room_id, name: room.get(a.room_id) || 'Room' } : null,
        status: a.status,
      }));
  const onSheet = ctx.patients.filter((p) => stayOf.has(p.id) || ctx.appointments.some((a) => a.patient_id === p.id));
  const residents = onSheet
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      const stay = stayOf.get(p.id);
      const treatments = treatmentsOf(p.id);
      const diet = diets.dietFor(p, treatments.length > 0);
      return {
        resident_id: p.id,
        name: p.name,
        in_house: Boolean(stay),
        stay_day: stay ? `Day ${Math.round((day.getTime() - stay.start_date.getTime()) / 86400000) + 1} of ${stay.duration_days}` : null,
        treatments,
        diet: { plan: diet.planName || null, notes: diet.notes || null, around_treatment: diet.therapyNotes || null },
      };
    });
  const events = activeEventsOnDay(ctx.events as EventRow[], day)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((e) => ({ label: e.activity_name, start_time: e.start_time, end_time: e.end_time }));
  const therapists_off = staffDay(ctx).filter((s) => s.off).map((s) => ({ therapist_id: s.staff_id, name: staffName.get(s.staff_id) || '', reason: s.off }));
  return { date, residents, events, therapists_off };
}

async function readResident(residentId: string, date: string) {
  const patient = await prisma.patient.findUnique({ where: { id: residentId }, include: { Stays: { orderBy: { start_date: 'desc' } } } });
  if (!patient) return null;
  const today = (await readDay(date)).residents.find((r) => r.resident_id === residentId);
  const day = dayOf(date);
  const stay = patient.Stays.find((s) => s.start_date <= day && s.end_date >= day) || patient.Stays[0] || null;
  const own = patient.preferred_staff_id ? await prisma.staff.findUnique({ where: { id: patient.preferred_staff_id } }) : null;
  return {
    resident_id: patient.id,
    name: patient.name,
    gender: patient.gender,
    own_therapist: own ? { id: own.id, name: own.name, required: patient.requires_preferred_staff } : null,
    stay: stay ? { start: ymd(stay.start_date), end: ymd(stay.end_date), nights: stay.duration_days } : null,
    date,
    stay_day: today?.stay_day ?? null,
    treatments: today?.treatments ?? [],
    diet: today?.diet ?? null,
    medical_notes: patient.medical_notes,
  };
}

async function inHouse(date: string) {
  const day = dayOf(date);
  const stays = await prisma.patientStay.findMany({
    where: { start_date: { lte: day }, end_date: { gte: day } },
    include: { Patient: { select: { id: true, name: true } } },
  });
  const pick = (s: (typeof stays)[number]) => ({ resident_id: s.Patient.id, name: s.Patient.name, until: ymd(s.end_date) });
  const same = (a: Date) => ymd(a) === date;
  return {
    date,
    arriving: stays.filter((s) => same(s.start_date)).map(pick),
    leaving: stays.filter((s) => same(s.end_date) && !same(s.start_date)).map(pick),
    staying: stays.filter((s) => !same(s.start_date) && !same(s.end_date)).map(pick),
  };
}

async function therapistsFree(date: string, therapyId?: string, residentId?: string) {
  const ctx = await loadDay(dayOf(date), prisma);
  const therapy = therapyId ? ctx.therapies.find((t) => t.id === therapyId) : undefined;
  const resident = residentId ? ctx.patients.find((p) => p.id === residentId) : undefined;
  const genderRule = Boolean(therapy?.requires_gender_match && resident && ctx.settings?.enforce_gender_match !== false);
  const open = toMinutes(ctx.settings?.opening_time || '09:00');
  const close = toMinutes(ctx.settings?.closing_time || '18:00');
  const byId = new Map(ctx.staff.map((s) => [s.id, s]));
  const therapyName = new Map(ctx.therapies.map((t) => [t.id, t.name]));
  return staffDay(ctx)
    .map((d) => ({ d, s: byId.get(d.staff_id)! }))
    .filter(({ s }) => !therapy || gives(s, therapy))
    .filter(({ s }) => !genderRule || s.gender === resident!.gender)
    .map(({ d, s }) => {
      const free: { from: string; to: string }[] = [];
      let at = open;
      for (const b of d.busy) {
        if (b.s > at) free.push({ from: hhmm(at), to: hhmm(Math.min(b.s, close)) });
        at = Math.max(at, b.e);
      }
      if (at < close) free.push({ from: hhmm(at), to: hhmm(close) });
      return {
        therapist_id: s.id,
        name: s.name,
        gender: s.gender,
        trained_in: s.specializations.map((id) => therapyName.get(id)).filter(Boolean),
        off: d.off,
        free: d.off ? [] : free.filter((f) => f.from < f.to),
        busy: d.busy.map((b) => ({ from: hhmm(b.s), to: hhmm(b.e), what: b.label })),
      };
    });
}

// ---------------------------------------------------------------- the tools

type Result = { content: ({ type: 'text'; text: string } | { type: 'resource'; resource: { uri: string; mimeType: string; blob: string } })[]; structuredContent?: Record<string, unknown>; isError?: boolean };

/** One sentence to say, then the data. The JSON is repeated as text for clients that ignore structured content. */
const reply = (say: string, data: Record<string, unknown>): Result => ({
  content: [{ type: 'text', text: say }, { type: 'text', text: JSON.stringify(data) }],
  structuredContent: data,
});
const refuse = (say: string): Result => ({ content: [{ type: 'text', text: say }], isError: true });
const pdf = (say: string, name: string, data: Buffer): Result => ({
  content: [{ type: 'text', text: say }, { type: 'resource', resource: { uri: `ayurcalm://${name}`, mimeType: 'application/pdf', blob: data.toString('base64') } }],
});
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

// ---------------------------------------------------------------- planning a day (#120)

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const PROPOSAL_MINUTES = 30;
type NotPlaced = { treatment_id: string; resident: string; therapy: string; start_time: string; reason: string };

/**
 * A plan the admin has not said yes to yet, kept as an AuditLog row so `apply`
 * writes exactly what was shown and nothing the model re-typed.
 */
async function propose(date: string, pins: Pin[], not_placed: NotPlaced[]) {
  const [appts, staff, rooms, patients, therapies] = await Promise.all([
    prisma.appointment.findMany({ where: { id: { in: pins.map((p) => p.appointment_id) } } }),
    prisma.staff.findMany(), prisma.therapyRoom.findMany(), prisma.patient.findMany(), prisma.therapy.findMany(),
  ]);
  const name = (id: string | null) => staff.find((s) => s.id === id)?.name || 'nobody';
  const place = (d: string, start_time: string, lead: string | null, others: string[], room_id: string | null) => ({
    date: d, start_time, team: { lead: lead ? { id: lead, name: name(lead) } : null, others: others.map((id) => ({ id, name: name(id) })) },
    room: room_id ? { id: room_id, name: rooms.find((r) => r.id === room_id)?.name || 'Room' } : null,
  });
  const moves = pins.flatMap((p) => {
    const a = appts.find((x) => x.id === p.appointment_id);
    if (!a) return [];
    const before = [a.staff_id, ...a.co_staff_ids].filter(Boolean) as string[];
    const after = [p.staff_id, ...(p.co_staff_ids ?? [])].filter(Boolean) as string[];
    const stays = before.filter((id) => after.includes(id)), out = before.filter((id) => !after.includes(id)), come = after.filter((id) => !before.includes(id));
    return [{
      treatment_id: a.id,
      resident: patients.find((x) => x.id === a.patient_id)?.name || 'Resident',
      therapy: therapies.find((t) => t.id === a.therapy_id)?.name || 'Treatment',
      from: place(ymd(a.scheduled_date), a.start_time, a.staff_id, a.co_staff_ids, a.room_id),
      to: p.cancel ? null : place(p.date, p.start_time, p.staff_id, p.co_staff_ids ?? [], p.room_id),
      // Who stays and who replaces whom, when a team changes.
      note: p.cancel ? 'cancelled' : out.length && come.length ? `${stays.length ? `${stays.map(name).join(' and ')} stays; ` : ''}${come.map(name).join(' and ')} replaces ${out.map(name).join(' and ')}` : undefined,
    }];
  });
  if (!moves.length) return { proposal_id: null, expires_at: null, date, summary: `Nothing to move on ${date}.`, moves, not_placed };
  const row = await prisma.auditLog.create({ data: { admin_id: 'mcp', action: 'mcp_proposal', entity_type: 'day', entity_id: date, new_value: { date, pins } as object } });
  return {
    proposal_id: row.id,
    expires_at: new Date(row.timestamp.getTime() + PROPOSAL_MINUTES * 60000).toISOString(),
    date,
    summary: `${plural(moves.length, 'treatment')} to move on ${date}${not_placed.length ? `, ${not_placed.length} with nowhere to go` : ''}. Nothing is changed until the admin says yes.`,
    moves, not_placed,
  };
}

export function buildServer() {
  const server = new McpServer(
    { name: 'ayurcalm', version: '1.0.0' },
    {
      instructions:
        `${PRODUCT} runs one residential Ayurveda centre. Dates are the centre's, never yours: ask centre/today first. ` +
        'Repeat refusals and reasons to the admin as they are written. Names and ids always come back together; never invent an id.',
    },
  );

  server.registerTool(
    'centre',
    {
      title: 'The centre',
      description: 'The centre itself. action "today": the current date, time and weekday at the centre, in its own timezone. Call this before working out today, tomorrow or any weekday — never use your own clock.',
      inputSchema: z.object({ action: z.enum(['today']) }),
      annotations: READ,
    },
    async () => {
      const now = await centreNow();
      return reply(`It is ${now.weekday} ${now.date}, ${now.time} at ${now.centre_name}.`, now);
    },
  );

  server.registerTool(
    'day',
    {
      title: 'One day at the centre',
      description:
        'One day at the centre. ' +
        'action "read": every resident on the day sheet with their treatments (time, therapy, therapist team, room), diet, and stay day; the classes and events; which therapists are off. Use it to answer questions about the day. ' +
        'action "check": what is wrong with the day — clashes, a therapist off but booked, a room without what a therapy needs, a resident with nothing — each with who, when, why, and why it cannot be fixed when it cannot. ' +
        'action "sheet": the printed day sheet as a PDF. action "rota": the therapist rota as a PDF, for one therapist if therapist_id is given.',
      inputSchema: z.object({
        action: z.enum(['read', 'check', 'sheet', 'rota']),
        date: DATE,
        therapist_id: z.string().optional().describe('Only for "rota": one therapist, from therapists/list.'),
      }),
      annotations: READ,
    },
    async ({ action, date, therapist_id }) => {
      if (action === 'read') {
        const d = await readDay(date);
        const count = d.residents.reduce((n, r) => n + r.treatments.length, 0);
        const off = d.therapists_off.map((t) => t.name).join(', ');
        return reply(`${date}: ${plural(d.residents.length, 'resident')}, ${plural(count, 'treatment')}${off ? `; off: ${off}` : ''}.`, d);
      }
      if (action === 'check') {
        const c = await checkDay(dayOf(date), prisma);
        const problems = c.problems.map((p) => ({
          problem_id: p.id,
          kind: p.kind,
          blocking: p.problem_class === 'blocking',
          who: p.who,
          start_time: p.start_time,
          what: p.what,
          treatment_id: p.appointment_id,
          fixable: Boolean(p.fix),
          no_fix_reason: p.no_fix_reason,
        }));
        const groups = c.groups.map((g) => ({ label: g.label, problem_ids: g.problem_ids }));
        return reply(c.headline || `Nothing wrong on ${date}.`, { date, headline: c.headline, groups, problems });
      }
      if (action === 'sheet') {
        return pdf(`The day sheet for ${date}.`, `day-sheet-${date}.pdf`, await generateDailySchedulePdf(date, prisma));
      }
      return pdf(`The therapist rota for ${date}.`, `therapist-rota-${date}.pdf`, await generateTherapistRotaPdf(date, prisma, therapist_id));
    },
  );

  server.registerTool(
    'residents',
    {
      title: 'Residents',
      description:
        'The centre\'s residents. action "find": residents whose name contains `name`. ' +
        'action "get": one resident on one date — their stay and which day of it, their own therapist, treatments, and what they eat and why. ' +
        'action "in_house": who is in the centre on a date, as arriving, staying and leaving.',
      inputSchema: z.object({
        action: z.enum(['find', 'get', 'in_house']),
        name: z.string().optional().describe('For "find".'),
        resident_id: z.string().optional().describe('For "get", from find, in_house or day/read.'),
        date: DATE.optional().describe('For "get" and "in_house". Defaults to the centre\'s today.'),
      }),
      annotations: READ,
    },
    async ({ action, name, resident_id, date }) => {
      const on = date || (await centreNow()).date;
      if (action === 'find') {
        if (!name) return refuse('Give part of the resident\'s name to find them.');
        const found = await prisma.patient.findMany({
          where: { name: { contains: name, mode: 'insensitive' } },
          select: { id: true, name: true, gender: true, Stays: { orderBy: { start_date: 'desc' }, take: 1 } },
          take: 20,
        });
        const residents = found.map((p) => ({ resident_id: p.id, name: p.name, gender: p.gender, latest_stay: p.Stays[0] ? { start: ymd(p.Stays[0].start_date), end: ymd(p.Stays[0].end_date) } : null }));
        return reply(residents.length ? `${plural(residents.length, 'resident')} match "${name}".` : `Nobody called "${name}".`, { residents });
      }
      if (action === 'get') {
        if (!resident_id) return refuse('Which resident? Find them by name first.');
        const r = await readResident(resident_id, on);
        if (!r) return refuse('No resident with that id. Find them by name first.');
        return reply(`${r.name}${r.stay_day ? `, ${r.stay_day}` : ''}: ${plural(r.treatments.length, 'treatment')} on ${on}.`, r);
      }
      const h = await inHouse(on);
      return reply(`${on}: ${h.arriving.length} arriving, ${h.staying.length} staying, ${h.leaving.length} leaving.`, h);
    },
  );

  server.registerTool(
    'therapists',
    {
      title: 'Therapists',
      description:
        'The centre\'s therapists. action "list": every therapist, with gender and the therapies they are trained in, plus every therapy with its id, length and how many therapists it needs. ' +
        'action "free": for one date, each therapist\'s free gaps and what fills the rest of their day. Give therapy_id to keep only therapists trained in it, and resident_id as well to apply the gender rule for that resident.',
      inputSchema: z.object({
        action: z.enum(['list', 'free']),
        date: DATE.optional().describe('For "free". Defaults to the centre\'s today.'),
        therapy_id: z.string().optional().describe('For "free".'),
        resident_id: z.string().optional().describe('For "free", with therapy_id.'),
      }),
      annotations: READ,
    },
    async ({ action, date, therapy_id, resident_id }) => {
      if (action === 'list') {
        const [staff, therapies] = await Promise.all([
          prisma.staff.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } }),
          prisma.therapy.findMany({ orderBy: { name: 'asc' } }),
        ]);
        return reply(`${plural(staff.length, 'therapist')}.`, {
          therapists: staff.map((s) => ({ therapist_id: s.id, name: s.name, gender: s.gender, trained_in: s.specializations.map((id) => therapies.find((t) => t.id === id)?.name).filter(Boolean) })),
          therapies: therapies.map((t) => ({ therapy_id: t.id, name: t.name, minutes: t.duration_minutes, therapists_needed: t.staff_required, same_gender: t.requires_gender_match })),
        });
      }
      const on = date || (await centreNow()).date;
      const therapists = await therapistsFree(on, therapy_id, resident_id);
      const free = therapists.filter((t) => t.free.length > 0);
      return reply(`${on}: ${plural(free.length, 'therapist')} with free time${free.length ? ` — ${free.map((t) => t.name).join(', ')}` : ''}.`, { date: on, therapists });
    },
  );

  server.registerTool(
    'plan',
    {
      title: 'Plan a day',
      description:
        'Re-plan a day: propose, show the admin, apply on their yes. Nothing changes before apply. ' +
        '"propose_day": one plan for everything day/check finds wrong on `date`: moves (from, to, note) and not_placed with reasons. absent_therapist_id plans a therapist\'s day away before their leave is recorded; allow_other_therapist lets a resident kept to their own therapist go to another. ' +
        '"propose_move": one treatment. With `to`: a proposal, or `refused` with the reason and nearest free time. Without: up to 3 alternatives. ' +
        '"apply": write a proposal as one batch, which history/undo reverses. After 30 minutes, or if the day changed, nothing is written and the answer says so.',
      inputSchema: z.object({
        action: z.enum(['propose_day', 'propose_move', 'apply']),
        date: DATE.optional(),
        absent_therapist_id: z.string().optional(),
        allow_other_therapist: z.boolean().optional(),
        treatment_id: z.string().optional(),
        to: z.object({
          date: z.string(), start_time: z.string(), therapist_id: z.string().nullable().describe('The lead.'),
          other_therapist_ids: z.array(z.string()), room_id: z.string().nullable(),
        }).partial().optional().describe('Only what changes.'),
        proposal_id: z.string().optional(),
      }),
      annotations: WRITE,
    },
    async ({ action, date, absent_therapist_id, allow_other_therapist, treatment_id, to, proposal_id }) => {
      if (action === 'propose_day') {
        if (!date) return refuse('Which date? Ask centre/today if you need today.');
        // ponytail: no `keep` (rows the admin placed themselves) yet; the planner takes pins, so add it when a conversation needs it (#121).
        const opts = { relaxPreferredStaff: allow_other_therapist };
        let plan: Pin[], not_placed: NotPlaced[];
        if (absent_therapist_id) {
          // Never apply: true, which writes without the guard (#102).
          const r = await planDay(absent_therapist_id, dayOf(date), prisma, { ...opts, apply: false });
          plan = [...r.moved, ...r.proposed].map((m) => ({ appointment_id: m.appointment_id, staff_id: m.to.staff_id, co_staff_ids: m.to.co_staff_ids, start_time: m.to.start_time, date: m.to.date, room_id: m.to.room_id, cancel: m.cancel }));
          not_placed = r.unplaced.map((u) => ({ treatment_id: u.appointment_id, resident: u.patient_name, therapy: u.therapy_name, start_time: u.start_time, reason: u.reason }));
        } else {
          const c = await checkDay(dayOf(date), prisma, opts);
          plan = c.plan.map((f) => ({ appointment_id: f.appointment_id, staff_id: f.staff_id, co_staff_ids: f.co_staff_ids, start_time: f.start_time, date: f.date, room_id: f.room_id, cancel: f.cancel }));
          not_placed = c.problems.filter((p) => p.appointment_id && !p.fix && p.no_fix_reason)
            .map((p) => ({ treatment_id: p.appointment_id!, resident: p.patient_name, therapy: p.who.split(' — ')[1] || '', start_time: p.start_time || '', reason: p.no_fix_reason! }));
        }
        const proposal = await propose(date, plan, not_placed);
        return reply(`${proposal.summary}${proposal.proposal_id ? ' Show the admin each move and ask before applying.' : ''}`, proposal);
      }

      if (action === 'propose_move') {
        const a = treatment_id ? await prisma.appointment.findUnique({ where: { id: treatment_id } }) : null;
        if (!a) return refuse('Which treatment? Take its treatment_id from day/read.');
        if (!to) {
          const options = await rowOptions(a.id, a.scheduled_date, prisma);
          const alternatives = options.map((f) => ({ label: f.label, to: { date: f.date, start_time: f.start_time, therapist_id: f.staff_id, other_therapist_ids: f.co_staff_ids, room_id: f.room_id } }));
          return reply(alternatives.length ? `${plural(alternatives.length, 'other place')} for it: ${alternatives.map((x) => x.label).join('; ')}. Call propose_move again with the one the admin picks.` : 'There is nowhere else to put it on that day.', { alternatives });
        }
        const pin: Pin = { appointment_id: a.id, date: to.date ?? ymd(a.scheduled_date), start_time: to.start_time ?? a.start_time, staff_id: to.therapist_id === undefined ? a.staff_id : to.therapist_id, co_staff_ids: to.other_therapist_ids ?? a.co_staff_ids, room_id: to.room_id === undefined ? a.room_id : to.room_id };
        const candidate = { id: a.id, scheduled_date: dayOf(pin.date), start_time: pin.start_time, duration_minutes: a.duration_minutes, staff_id: pin.staff_id, co_staff_ids: pin.co_staff_ids, room_id: pin.room_id, patient_id: a.patient_id, therapy_id: a.therapy_id };
        const ctx = await loadDay(candidate.scheduled_date, prisma);
        const conflict = findConflict(candidate, ctx);
        if (conflict) {
          const nearest_free_time = nearestFreeTime(candidate, ctx);
          return reply(`${conflict.message}${nearest_free_time ? ` The nearest free time is ${nearest_free_time}.` : ''}`, { refused: { rule: conflict.reason, message: conflict.message }, nearest_free_time });
        }
        const proposal = await propose(pin.date, [pin], []);
        return reply(`That move is possible. Ask the admin before applying.`, proposal);
      }

      const row = proposal_id ? await prisma.auditLog.findUnique({ where: { id: proposal_id } }) : null;
      if (!row || row.action !== 'mcp_proposal') return refuse('No plan with that id. Make a fresh one with propose_day or propose_move.');
      const stored = row.new_value as unknown as { date: string; pins: Pin[]; batch_id?: string; applied?: number };
      // The same yes twice is one batch.
      if (stored.batch_id) return reply(`That plan is already applied: ${plural(stored.applied ?? 0, 'treatment')} moved.`, { applied: stored.applied, batch_id: stored.batch_id });
      if (Date.now() - row.timestamp.getTime() > PROPOSAL_MINUTES * 60000) {
        return reply(`That plan is more than half an hour old, so I haven't used it. Shall I make a fresh one for ${stored.date}?`, { expired: true });
      }
      const done = await acceptPlan(stored.pins, prisma);
      if (!('batch_id' in done)) {
        const made = new Intl.DateTimeFormat('en-GB', { timeZone: (await centreNow()).timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(row.timestamp);
        const what = 'conflict' in done ? done.conflict.message : 'A treatment in it no longer exists.';
        return reply(`That plan was made at ${made}, and the day has changed since: ${what} I haven't changed anything. Shall I make a fresh plan?`, { stale: true, reason: what });
      }
      await prisma.auditLog.update({ where: { id: row.id }, data: { new_value: { ...stored, ...done } as object } });
      return reply(`Done: ${plural(done.applied, 'treatment')} moved on ${stored.date}. history/undo with this batch_id puts the day back.`, { applied: done.applied, batch_id: done.batch_id });
    },
  );

  server.registerTool(
    'history',
    {
      title: 'Undo',
      description: '"undo": put back everything one applied plan changed. batch_id comes from plan/apply.',
      inputSchema: z.object({ action: z.enum(['undo']), batch_id: z.string() }),
      annotations: WRITE,
    },
    async ({ batch_id }) => {
      const undone = await undoReplan(batch_id, prisma);
      return undone ? reply('Undone: the day is as it was before that plan.', { undone: true, batch_id }) : refuse('Nothing to undo with that id, or it is already undone.');
    },
  );

  return server;
}

// ---------------------------------------------------------------- mounting

const handler = createMcpHandler(() => buildServer(), {
  onerror: (e) => console.error('[mcp]', e.message),
});
const serve = toNodeHandler(handler);

/** Everything under /mcp: the key first, then the protocol. */
export const mcpRouter = Router();
mcpRouter.all('/', requireMcpKey, (req: Request, res: Response) => serve(req, res, req.body));

