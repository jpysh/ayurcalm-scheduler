import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from './server.js';
import { getSettings, requireAdmin } from './settings.js';
import { centreClock } from './availability.js';
import { expandRoomNames, guestRoomsFor, spans } from './guestRooms.js';

/**
 * The centre's packages and accommodation types (#285 stories 11 and 12): reference
 * lists a patient's card picks from. Prices are whole rupees and nothing here bills:
 * no invoice, no payment (#53). Like diet plans, one in use is retired, not deleted,
 * so the stays that chose it still read.
 */
export const packagesRouter = Router();
export const accommodationsRouter = Router();

const notes = z.string().trim().max(500).nullable().optional();
const money = z.number().int().min(0).max(10_000_000);
const packageBody = z.object({ name: z.string().trim().min(1).max(80), days: z.number().int().min(1).max(365), price: money, notes, is_active: z.boolean().optional() });
const accommodationBody = z.object({ name: z.string().trim().min(1).max(80), price_per_day: money, notes, is_active: z.boolean().optional() });

const taken = (res: Response) => res.status(409).json({ error: 'One with that name already exists' });

packagesRouter.get('/', async (_req: Request, res: Response) => {
  const rows = await prisma.package.findMany({ orderBy: [{ days: 'asc' }, { name: 'asc' }], include: { _count: { select: { Stays: true } } } });
  res.json(rows.map(({ _count, ...p }) => ({ ...p, patients: _count.Stays })));
});
packagesRouter.post('/', requireAdmin, async (req: Request, res: Response) => {
  const body = packageBody.parse(req.body);
  if (await prisma.package.findUnique({ where: { name: body.name } })) return void taken(res);
  res.status(201).json(await prisma.package.create({ data: body }));
});
packagesRouter.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  const body = packageBody.partial().parse(req.body);
  const clash = body.name ? await prisma.package.findFirst({ where: { name: body.name, id: { not: String(req.params.id) } } }) : null;
  if (clash) return void taken(res);
  res.json(await prisma.package.update({ where: { id: String(req.params.id) }, data: body }));
});
packagesRouter.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const inUse = await prisma.patientStay.count({ where: { package_id: id } });
  if (inUse) { await prisma.package.update({ where: { id }, data: { is_active: false } }); res.json({ retired: true, patients: inUse }); return; }
  await prisma.package.delete({ where: { id } });
  res.json({ deleted: true });
});

accommodationsRouter.get('/', async (_req: Request, res: Response) => {
  const rows = await prisma.accommodationType.findMany({ orderBy: [{ price_per_day: 'asc' }, { name: 'asc' }], include: { _count: { select: { Stays: true, GuestRooms: { where: { is_active: true } } } } } });
  res.json(rows.map(({ _count, ...a }) => ({ ...a, patients: _count.Stays, rooms: _count.GuestRooms })));
});
accommodationsRouter.post('/', requireAdmin, async (req: Request, res: Response) => {
  const body = accommodationBody.parse(req.body);
  if (await prisma.accommodationType.findUnique({ where: { name: body.name } })) return void taken(res);
  res.status(201).json(await prisma.accommodationType.create({ data: body }));
});
accommodationsRouter.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  const body = accommodationBody.partial().parse(req.body);
  const clash = body.name ? await prisma.accommodationType.findFirst({ where: { name: body.name, id: { not: String(req.params.id) } } }) : null;
  if (clash) return void taken(res);
  res.json(await prisma.accommodationType.update({ where: { id: String(req.params.id) }, data: body }));
});
accommodationsRouter.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const inUse = await prisma.patientStay.count({ where: { accommodation_id: id } });
  if (inUse) { await prisma.accommodationType.update({ where: { id }, data: { is_active: false } }); res.json({ retired: true, patients: inUse }); return; }
  await prisma.accommodationType.delete({ where: { id } });
  res.json({ deleted: true });
});

/**
 * Guest rooms (#456): the rooms patients sleep in, each of one accommodation type. The
 * price stays on the type. "T1–T6" (or "101-104", or "T1, T2, Hut A") adds several at once.
 */
export const guestRoomsRouter = Router();

const roomBody = z.object({ name: z.string().trim().min(1).max(80), accommodation_id: z.string().uuid(), beds: z.number().int().min(1).max(20).optional(), is_active: z.boolean().optional() });

guestRoomsRouter.get('/', async (_req: Request, res: Response) => {
  const rows = await prisma.guestRoom.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { Stays: true } } } });
  // Natural order, so T2 comes before T10.
  rows.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  res.json(rows.map(({ _count, ...r }) => ({ ...r, patients: _count.Stays })));
});
// Who is in each room for some nights, and which are free for all of them: the pickers and "Is a room free?".
guestRoomsRouter.get('/free', async (req: Request, res: Response) => {
  const q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), stay: z.string().uuid().optional() }).parse(req.query);
  res.json(await guestRoomsFor(prisma, new Date(`${q.from}T00:00:00Z`), new Date(`${q.to}T00:00:00Z`), q.stay));
});
guestRoomsRouter.post('/', requireAdmin, async (req: Request, res: Response) => {
  const body = roomBody.parse(req.body);
  const names = expandRoomNames(body.name).filter((n) => n.length <= 20);
  if (!names.length) return void res.status(400).json({ error: 'Give each room a name of up to 20 characters' });
  const clash = await prisma.guestRoom.findMany({ where: { name: { in: names } }, select: { name: true } });
  if (clash.length) return void res.status(409).json({ error: `${clash.map((c) => c.name).join(', ')} already exist${clash.length === 1 ? 's' : ''}` });
  await prisma.guestRoom.createMany({ data: names.map((name) => ({ name, accommodation_id: body.accommodation_id, beds: body.beds ?? 1 })) });
  res.status(201).json({ added: names });
});
guestRoomsRouter.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  const body = roomBody.partial().parse(req.body);
  const clash = body.name ? await prisma.guestRoom.findFirst({ where: { name: body.name, id: { not: String(req.params.id) } } }) : null;
  if (clash) return void taken(res);
  const id = String(req.params.id);
  // Fewer beds than guests already booked (#1186): refused with the first over-full night, from today on.
  const today = new Date(`${centreClock((await getSettings()).timezone).date}T00:00:00Z`);
  const last = await prisma.patientStay.aggregate({ _max: { end_date: true }, where: { end_date: { gte: today }, OR: [{ guest_room_id: id }, { EarlierRooms: { some: { guest_room_id: id } } }] } });
  const full = await prisma.$transaction(async (tx) => {
    const room = await tx.guestRoom.update({ where: { id }, data: body });
    if (body.beds === undefined || !last._max.end_date) return { room };
    const guests = (await guestRoomsFor(tx, today, last._max.end_date)).find((r) => r.id === id)?.guests ?? [];
    for (let d = today.getTime(); d <= last._max.end_date.getTime(); d += 86400000) {
      const date = new Date(d).toISOString().slice(0, 10);
      const names = guests.filter((g) => g.start_date <= date && (date < g.end_date || g.start_date === g.end_date && date === g.start_date)).map((g) => g.name);
      if (names.length > room.beds) throw Object.assign(new Error('over-full'), { on: { date, names } });
    }
    return { room };
  }).catch((e) => { if (e.on) return { on: e.on as { date: string; names: string[] } }; throw e; });
  if ('on' in full) {
    const day = new Date(`${full.on.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
    return void res.status(409).json({ error: `${body.name ?? 'This room'} has ${full.on.names.length} guests on ${day}: ${full.on.names.join(', ')}. Move one first`, date: full.on.date, names: full.on.names });
  }
  res.json(full.room);
});
/**
 * Guests with nights in this room from today on (#1187), each with the first other room of the
 * same type free for those nights: the move that has to happen before the room can be retired.
 */
/** Guests in the room on nights from `since` (default the centre's today) up to `until`, each with a free room to move to: retiring (#1187) and out of use (#1188). */
async function guestsAhead(id: string, since?: string, until?: string) {
  const now = centreClock((await getSettings()).timezone).date;
  const today = new Date(`${since && since > now ? since : now}T00:00:00Z`);
  const stop = until ? new Date(`${until}T00:00:00Z`) : null;
  const room = await prisma.guestRoom.findUnique({ where: { id } });
  const stays = await prisma.patientStay.findMany({ where: { end_date: { gt: today }, OR: [{ guest_room_id: id }, { EarlierRooms: { some: { guest_room_id: id } } }] }, include: { Patient: { select: { name: true } }, EarlierRooms: true }, orderBy: { start_date: 'asc' } });
  const out = [];
  for (const s of stays) {
    const here = spans(s).filter((p) => p.room === id && p.end > today && (!stop || p.start < stop));
    if (!here.length) continue;
    const from = here[0].start > today ? here[0].start : today;
    const to = here[here.length - 1].end;
    // ponytail: two guests may be offered the same room; the second tap is then refused and the list reloads with another.
    const free = (await guestRoomsFor(prisma, from, to, s.id)).filter((r) => r.free && r.id !== id);
    const move_to = free.find((r) => r.accommodation_id === room?.accommodation_id) ?? free[0] ?? null;
    out.push({ stay_id: s.id, patient_id: s.patient_id, name: s.Patient.name, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), move_from: from.toISOString().slice(0, 10), move_to: move_to && { id: move_to.id, name: move_to.name, type: move_to.type } });
  }
  return out;
}
// Made up after a guest left (#1199), or not after all: a second tap undoes a mistaken one.
guestRoomsRouter.put('/:id/ready', requireAdmin, async (req: Request, res: Response) => {
  const body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ready: z.boolean() }).parse(req.body);
  const room = await prisma.guestRoom.update({ where: { id: String(req.params.id) }, data: { ready_on: body.ready ? new Date(`${body.date}T00:00:00Z`) : null } });
  res.json({ id: room.id, ready_on: body.ready ? body.date : null });
});
guestRoomsRouter.get('/:id/ahead', async (req: Request, res: Response) => {
  const q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.query);
  res.json(await guestsAhead(String(req.params.id), q.from, q.to));
});
guestRoomsRouter.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const ahead = await guestsAhead(id);
  if (ahead.length) return void res.status(409).json({ error: `${ahead.length === 1 ? `${ahead[0].name} is` : `${ahead.length} guests are`} booked in this room from today on. Move ${ahead.length === 1 ? 'them' : 'them all'} first`, guests: ahead });
  await prisma.timeOff.deleteMany({ where: { entity_type: 'guest_room', entity_id: id } });
  const inUse = await prisma.patientStay.count({ where: { OR: [{ guest_room_id: id }, { EarlierRooms: { some: { guest_room_id: id } } }] } });
  if (inUse) { await prisma.guestRoom.update({ where: { id }, data: { is_active: false } }); res.json({ retired: true, patients: inUse }); return; }
  await prisma.guestRoom.delete({ where: { id } });
  res.json({ deleted: true });
});
