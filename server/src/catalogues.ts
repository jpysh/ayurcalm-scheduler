import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from './server.js';
import { requireAdmin } from './settings.js';

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
  const rows = await prisma.accommodationType.findMany({ orderBy: [{ price_per_day: 'asc' }, { name: 'asc' }], include: { _count: { select: { Stays: true } } } });
  res.json(rows.map(({ _count, ...a }) => ({ ...a, patients: _count.Stays })));
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
