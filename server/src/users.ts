import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from './server.js';
import { requireAdmin } from './settings.js';

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD = 8;

/** Never return password hashes or reset tokens to a client. */
const publicFields = {
  id: true,
  email: true,
  name: true,
  role: true,
  is_active: true,
  created_at: true,
  last_login: true,
} as const;

const password = z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters`);

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().max(120).nullish(),
  role: z.enum(['admin', 'staff']),
  password,
});

const updateSchema = z.object({
  name: z.string().trim().max(120).nullish(),
  role: z.enum(['admin', 'staff']).optional(),
  is_active: z.boolean().optional(),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: password,
});

/**
 * Guards against an install with no way back in: the last active administrator
 * cannot be demoted, deactivated or deleted.
 */
async function wouldRemoveLastAdmin(userId: string): Promise<boolean> {
  const admins = await prisma.user.findMany({
    where: { role: 'admin', is_active: true },
    select: { id: true },
  });
  return admins.length <= 1 && admins.some(a => a.id === userId);
}

export const usersRouter = Router();

usersRouter.get('/', requireAdmin, async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: publicFields,
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
  });
  res.json(users);
});

usersRouter.post('/', requireAdmin, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid user' });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    res.status(409).json({ error: 'A user with that email already exists' });
    return;
  }
  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name ?? null,
      role: parsed.data.role,
      password_hash: await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS),
    },
    select: publicFields,
  });
  res.status(201).json(user);
});

usersRouter.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid changes' });
    return;
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const losesAdmin = parsed.data.role === 'staff' || parsed.data.is_active === false;
  if (losesAdmin && await wouldRemoveLastAdmin(target.id)) {
    res.status(400).json({ error: 'This is the only administrator — promote another user first' });
    return;
  }
  const user = await prisma.user.update({
    where: { id: target.id },
    data: parsed.data,
    select: publicFields,
  });
  res.json(user);
});

usersRouter.post('/:id/set-password', requireAdmin, async (req: Request, res: Response) => {
  const parsed = z.object({ new_password: password }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password' });
    return;
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  await prisma.user.update({
    where: { id: target.id },
    data: { password_hash: await bcrypt.hash(parsed.data.new_password, BCRYPT_ROUNDS) },
  });
  res.json({ ok: true });
});

usersRouter.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (target.id === req.user?.id) {
    res.status(400).json({ error: 'You cannot delete your own account' });
    return;
  }
  if (await wouldRemoveLastAdmin(target.id)) {
    res.status(400).json({ error: 'This is the only administrator — promote another user first' });
    return;
  }
  await prisma.user.delete({ where: { id: target.id } });
  res.json({ ok: true });
});

/** Any signed-in user changing their own password. */
export const accountRouter = Router();

accountRouter.post('/change-password', async (req: Request, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request' });
    return;
  }
  const me = await prisma.user.findUnique({ where: { id: req.user?.id ?? '' } });
  if (!me) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!(await bcrypt.compare(parsed.data.current_password, me.password_hash))) {
    res.status(400).json({ error: 'Current password is incorrect' });
    return;
  }
  await prisma.user.update({
    where: { id: me.id },
    data: { password_hash: await bcrypt.hash(parsed.data.new_password, BCRYPT_ROUNDS) },
  });
  res.json({ ok: true });
});
