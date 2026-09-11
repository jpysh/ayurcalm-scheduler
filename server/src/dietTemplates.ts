import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from './server.js';
import { requireAdmin } from './settings.js';

/**
 * Reusable diet plans. A patient is normally put on one of these rather than
 * given something bespoke, and a segment points at the template rather than
 * copying it — so correcting a plan reaches everyone on it who has not been
 * given something different.
 */
export const dietTemplatesRouter = Router();

const publicFields = {
  id: true,
  name: true,
  description: true,
  therapy_breakfast: true,
  therapy_lunch: true,
  therapy_dinner: true,
  therapy_snacks: true,
  rest_breakfast: true,
  rest_lunch: true,
  rest_dinner: true,
  rest_snacks: true,
  medication: true,
  pre_therapy_notes: true,
  post_therapy_notes: true,
  is_active: true,
  updated_at: true,
} as const;

const mealFields = z.object({
  therapy_breakfast: z.string().max(2000).default(''),
  therapy_lunch: z.string().max(2000).default(''),
  therapy_dinner: z.string().max(2000).default(''),
  therapy_snacks: z.string().max(2000).default(''),
  rest_breakfast: z.string().max(2000).default(''),
  rest_lunch: z.string().max(2000).default(''),
  rest_dinner: z.string().max(2000).default(''),
  rest_snacks: z.string().max(2000).default(''),
  medication: z.string().max(2000).optional(),
  pre_therapy_notes: z.string().max(2000).optional(),
  post_therapy_notes: z.string().max(2000).optional(),
  description: z.string().max(2000).optional(),
  is_active: z.boolean().optional(),
});

const createSchema = mealFields.extend({ name: z.string().trim().min(1).max(120) });
// A partial update leaves absent fields alone, the way settings does.
const updateSchema = createSchema.partial();

dietTemplatesRouter.get('/', async (_req: Request, res: Response) => {
  // The count comes with the list because editing a plan changes what every
  // patient on it eats, and whoever is editing should be told that first.
  const rows = await prisma.dietTemplate.findMany({
    select: { ...publicFields, _count: { select: { Segments: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(rows.map(({ _count, ...t }) => ({ ...t, patients: _count.Segments })));
});

dietTemplatesRouter.post('/', requireAdmin, async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body);
  const existing = await prisma.dietTemplate.findUnique({ where: { name: body.name } });
  if (existing) {
    res.status(409).json({ error: 'A plan with that name already exists' });
    return;
  }
  res.status(201).json(await prisma.dietTemplate.create({ data: body, select: publicFields }));
});

dietTemplatesRouter.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  const body = updateSchema.parse(req.body);
  const found = await prisma.dietTemplate.findUnique({ where: { id: req.params.id } });
  if (!found) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  if (body.name && body.name !== found.name) {
    const clash = await prisma.dietTemplate.findUnique({ where: { name: body.name } });
    if (clash) {
      res.status(409).json({ error: 'A plan with that name already exists' });
      return;
    }
  }
  res.json(await prisma.dietTemplate.update({ where: { id: found.id }, data: body, select: publicFields }));
});

dietTemplatesRouter.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  const inUse = await prisma.dietPlanSegment.count({ where: { template_id: req.params.id } });
  if (inUse > 0) {
    // Deleting would leave those patients with a plan that resolves to nothing.
    // Retiring keeps the sheet printable and stops the plan being offered again.
    const retired = await prisma.dietTemplate.update({
      where: { id: req.params.id },
      data: { is_active: false },
      select: publicFields,
    });
    res.json({ retired: true, patients: inUse, template: retired });
    return;
  }
  await prisma.dietTemplate.delete({ where: { id: req.params.id } });
  res.json({ deleted: true });
});
