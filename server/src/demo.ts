import type { Request, Response, NextFunction } from 'express';

/**
 * The public demo (#84): one install anyone can sign into, put back to the
 * seeded centre every six hours. Off unless DEMO_MODE=true.
 */
export const DEMO = process.env.DEMO_MODE === 'true';

const EVERY = 6 * 60 * 60 * 1000;

/** Resets fall on fixed UTC hours (00, 06, 12, 18), so a restart never moves the one on screen. */
export const nextReset = (now = Date.now()) => new Date(Math.floor(now / EVERY) * EVERY + EVERY);

// What a visitor could use to lock the next one out, or to load their own data.
const BLOCKED = [/^\/users(\/|$)/, /^\/account\/change-password$/, /^\/settings\/(import|clear-demo-data)$/];

export function demoGuard(req: Request, res: Response, next: NextFunction) {
  if (DEMO && req.method !== 'GET' && BLOCKED.some((r) => r.test(req.path))) {
    res.status(403).json({ error: 'Not available in the demo' });
    return;
  }
  next();
}

export function scheduleDemoResets(reset: () => Promise<unknown>) {
  if (!DEMO) return;
  const tick = () => setTimeout(async () => {
    try { await reset(); console.log('[demo] reset to the seeded centre'); } catch (e) { console.error('[demo] reset failed', e); }
    tick();
  }, nextReset().getTime() - Date.now());
  tick();
}
