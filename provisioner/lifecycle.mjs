// What happens to each trial centre, from its record and the time (#247).
// Pure, so the fake-clock test drives it: node provisioner/test.mjs
const H = 3_600_000, D = 24 * H;

/**
 * c: { created, paused_at?, trial?: { started_at, ends_at, plan? } }
 * Returns the one thing to do now, or null. No emails (#247): a paused centre's
 * own address says when it goes and switches it back on; an ended trial is
 * read-only in the app itself.
 */
export function next(c, now) {
  if (c.trial?.plan) return null; // a paying centre is never paused or deleted (#250)
  if (c.paused_at) return now >= deletesAt(c) ? { do: 'delete', why: 'paused 14 days' } : null;
  if (!c.trial?.started_at) return now >= c.created + 72 * H ? { do: 'pause' } : null;
  return now >= deletesAt(c) ? { do: 'delete', why: 'trial ended 60 days ago' } : null;
}

/** When a paused centre, or an ended trial, is deleted. */
export const deletesAt = (c) => (c.paused_at ? c.paused_at + 14 * D : Date.parse(c.trial.ends_at) + 60 * D);

/** Sign-up limits: 3 per address a day, one live centre per email, 20 a day, 25 live. */
export function refuse(signups, centres, { ip, email }, now) {
  const today = signups.filter((s) => now - s.at < D);
  if (today.filter((s) => s.ip === ip).length >= 3) return 'Too many sign-ups from this connection today. Try again tomorrow.';
  if (centres.some((c) => c.email === email) || today.some((s) => s.email === email && !s.used)) return 'This email already has a trial centre. Check your inbox for its link.';
  if (today.length >= 20) return 'We have opened as many centres as we can today. Try again tomorrow.';
  if (centres.length >= 25) return 'waitlist';
  return null;
}

/** centre name -> address slug, "-2" and on when taken. */
export function slugFor(name, taken) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'centre';
  const reserved = new Set(['demo', 'signup', 'www', 'mail', 'api', ...taken]);
  let s = base, n = 1;
  while (reserved.has(s)) s = `${base}-${++n}`;
  return s;
}
