// What happens to each trial centre, from its record and the time (#247).
// Pure, so the fake-clock test drives it: node provisioner/test.mjs
const H = 3_600_000, D = 24 * H;

/**
 * c: { created, paused_at?, trial?: { started_at, ends_at }, warned?: {[key]: true} }
 * Returns the one thing to do now, or null. `warn` keys are sent once each.
 */
export function next(c, now) {
  const w = (key) => !c.warned?.[key];
  if (c.trial?.plan) return null; // a paying centre is never paused or deleted (#250)
  if (c.paused_at) {
    const del = c.paused_at + 14 * D;
    if (now >= del) return { do: 'delete', why: 'paused 14 days' };
    if (now >= del - D && w('p1')) return { do: 'warn', key: 'p1', days: 1 };
    if (now >= del - 7 * D && w('p7')) return { do: 'warn', key: 'p7', days: 7 };
    return null;
  }
  if (!c.trial?.started_at) return now >= c.created + 72 * H ? { do: 'pause' } : null;
  const del = Date.parse(c.trial.ends_at) + 60 * D;
  if (now >= del) return { do: 'delete', why: 'trial ended 60 days ago' };
  if (now >= del - D && w('e1')) return { do: 'warn', key: 'e1', days: 1 };
  if (now >= del - 7 * D && w('e7')) return { do: 'warn', key: 'e7', days: 7 };
  if (now >= Date.parse(c.trial.ends_at) && w('ended')) return { do: 'warn', key: 'ended', days: 60 };
  if (now >= Date.parse(c.trial.ends_at) - 7 * D && w('t7')) return { do: 'warn', key: 't7', days: 7 };
  return null;
}

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
