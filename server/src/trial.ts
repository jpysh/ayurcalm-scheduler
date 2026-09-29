import type { Request, Response, NextFunction } from 'express';
import { prisma } from './server.js';
import { getSettings } from './settings.js';

/**
 * Cloud trials (#247). Off unless TRIAL=true. The 30 days start on real use:
 * the first resident added or day sheet printed after setup. After them the
 * centre is read-only; reading, signing in and "Download everything" still work.
 */
export const TRIAL = process.env.TRIAL === 'true';
const DAY = 86_400_000;
export const TRIAL_DAYS = 30;

type Billing = { plan?: string | null; paid_until?: Date | null };

/** A plan (#250) lifts the trial's read-only; unpaid 14 days past paid_until, it is read-only again. Never deleted for that. */
export function trialState(started: Date | null, now = Date.now(), bill: Billing = {}) {
  const plan = bill.plan ?? null, paid_until = bill.paid_until?.toISOString() ?? null;
  if (plan) return { started_at: started?.toISOString() ?? null, ends_at: null, plan, paid_until, read_only: !!bill.paid_until && now >= bill.paid_until.getTime() + 14 * DAY };
  if (!started) return { started_at: null, ends_at: null, plan, paid_until, read_only: false };
  const ends = started.getTime() + TRIAL_DAYS * DAY;
  return { started_at: started.toISOString(), ends_at: new Date(ends).toISOString(), plan, paid_until, read_only: now >= ends };
}

export async function trialInfo() {
  if (!TRIAL) return undefined;
  const s = await getSettings();
  return trialState(s.trial_started_at, Date.now(), s);
}

// POST /patients and the day sheet PDF are "real use"; the clock starts once they succeed.
const STARTS = [/^\/patients$/, /^\/daily-schedule-pdf$/];

export async function trialGuard(req: Request, res: Response, next: NextFunction) {
  if (!TRIAL) return next();
  const s = await getSettings();
  if (req.method !== 'GET' && trialState(s.trial_started_at, Date.now(), s).read_only) {
    res.status(403).json({ error: s.plan ? 'Payment is overdue, so the centre is read-only. Your data is safe; choose a plan in Settings to carry on.' : 'The 30-day trial has ended. Your data is safe: download everything from Settings, or choose a plan.' });
    return;
  }
  if (!s.trial_started_at && s.setup_complete && STARTS.some((r) => r.test(req.path)) && (req.method === 'POST' || req.path.endsWith('pdf'))) {
    res.on('finish', () => {
      if (res.statusCode < 300) prisma.settings.updateMany({ where: { trial_started_at: null }, data: { trial_started_at: new Date() } }).catch(() => {});
    });
  }
  next();
}
