import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from './server.js';

const TOKEN_TTL = '12h';

export const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
export const DEFAULT_ADMIN_PASSWORD = 'demo1234';

/**
 * The signing secret. Generated per-process when unset so a misconfigured
 * deployment fails closed (tokens die on restart) rather than trusting a
 * hardcoded default that every install would share.
 */
export function jwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (!warnedAboutSecret) {
    console.warn('[auth] JWT_SECRET unset or too short — using a random per-process secret. Sessions will not survive a restart. Set JWT_SECRET in .env.');
    warnedAboutSecret = true;
  }
  return ephemeralSecret;
}
let warnedAboutSecret = false;
const ephemeralSecret = Math.random().toString(36).slice(2) + Date.now().toString(36);

export type AuthUser = { id: string; email: string; role: string; name: string | null };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  // Same response for unknown user and wrong password, so the endpoint does
  // not reveal which emails exist.
  if (!user || !user.is_active || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { last_login: new Date() } });
  const payload: AuthUser = { id: user.id, email: user.email, role: user.role, name: user.name };
  const token = jwt.sign(payload, jwtSecret(), { expiresIn: TOKEN_TTL });
  res.json({ token, user: payload });
});

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    req.user = jwt.verify(token, jwtSecret()) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid' });
  }
}

/**
 * Logged at startup so an operator who never changed the seeded password is
 * told about it every time the server boots.
 */
export async function warnIfDefaultAdminUnchanged() {
  try {
    const admin = await prisma.user.findUnique({ where: { email: DEFAULT_ADMIN_EMAIL } });
    if (!admin || !admin.is_active) return;
    if (await bcrypt.compare(DEFAULT_ADMIN_PASSWORD, admin.password_hash)) {
      console.warn('');
      console.warn('  ****************************************************************');
      console.warn('  *  WARNING: the demo admin still uses its default password.    *');
      console.warn(`  *  ${DEFAULT_ADMIN_EMAIL} / ${DEFAULT_ADMIN_PASSWORD}                          *`);
      console.warn('  *  Change it before exposing this server to a network.         *');
      console.warn('  ****************************************************************');
      console.warn('');
    }
  } catch {
    // Database not reachable yet; health checks will surface that separately.
  }
}
