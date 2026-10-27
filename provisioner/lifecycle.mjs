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

// Centres that never get a trial-ending email or notice (#1301): Babaji is free for life.
const FREE = new Set(['babajiayurveda']);

/**
 * The three behaviour emails (#1301), each sent once: no sheet by day 2, silent for 3 days, 7 days left.
 * c.sheets: when each day's sheet was last printed, one per day; c.sent: the keys already sent.
 * Payment is arranged by hand for now, so the last one asks for a reply, never a checkout.
 */
export function nudge(c, now) {
  if (c.paused_at || c.trial?.plan || FREE.has(c.slug) || !c.trial?.started_at) return null;
  const sent = c.sent || {}, start = Date.parse(c.trial.started_at), end = Date.parse(c.trial.ends_at);
  const last = Math.max(0, ...(c.sheets || []));
  if (!sent.ending && end > now && end - now <= 7 * D) return 'ending';
  if (!sent.nosheet && !c.sheet_at && now - start >= 2 * D) return 'nosheet';
  if (!sent.silent && c.sheet_at && now - last >= 3 * D && end > now) return 'silent';
  return null;
}

export function nudgeEmail(key, c, domain) {
  const at = `https://${c.slug}.${domain}`;
  return {
    nosheet: [`Tomorrow's sheet in 3 steps`, `1. Open Make it mine: ${at}/setup/mine\n2. Add your therapists, rooms and tomorrow's guests.\n3. Print tomorrow's sheet from the menu.\n\nStuck? Reply to this email.`],
    silent: [`${c.centre}: no day sheet for 3 days`, `Nothing has been printed at ${at} for 3 days. If something got in the way, reply and tell us what.`],
    ending: [`${c.centre}: 7 days left`, `7 days left. Reply or WhatsApp +420777558262 to keep going.\n\nYour data is never at risk: after the trial the centre is read-only and you can download everything.`],
  }[key];
}

/** Activated (#1301): its own sheet printed on 3 different days within the trial's first 7. */
export const activated = (c) => c.trial?.started_at && (c.sheets || []).filter((t) => t - Date.parse(c.trial.started_at) < 7 * D).length >= 3;

/** When a paused centre, or an ended trial, is deleted: never within 30 days of signing up (#920). */
export const deletesAt = (c) => Math.max((c.signed_up ?? c.created) + 30 * D, c.paused_at ? c.paused_at + 14 * D : Date.parse(c.trial.ends_at) + 60 * D);

/** Sign-up limits: 3 per address a day, one live centre per email, 20 a day, 10 live. */
export function refuse(signups, centres, { ip, email }, now) {
  const today = signups.filter((s) => now - s.at < D);
  if (today.filter((s) => s.ip === ip).length >= 3) return 'Too many sign-ups from this connection today. Try again tomorrow.';
  if (centres.some((c) => c.email === email) || today.some((s) => s.email === email && !s.used)) return 'This email already has a trial centre. Check your inbox for its link.';
  if (today.length >= 20) return 'We have opened as many centres as we can today. Try again tomorrow.';
  // Ten trials beside the real centre while everything runs on the Mac (#816).
  if (centres.length >= 10) return 'waitlist';
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

/** "4 min", "2 h 5 min", "3 days 1 h": how long a trial took to get somewhere (#730). */
export function took(ms) {
  const m = Math.max(0, Math.round(ms / 60_000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  if (d) return `${d} ${d === 1 ? 'day' : 'days'}${h ? ` ${h} h` : ''}`;
  return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}

/** A sign-up's page may be handed a sign-in link while its centre is ready and the link would still live (30 minutes, #588). */
export const linkOpen = (s, now) => s.state === 'ready' && now - (s.ready_at ?? s.at) < 30 * 60_000;

// A merge to main goes out in order (#904): demo, then live centres, then trials; the first failure stops it.
// `done` and the failed site are what a rollback puts back (#1178); later sites were never touched.
export async function rollout(sites, up) {
  const done = [];
  for (const s of sites) {
    try { await up(s); done.push(s); } catch (e) { return { failed: s.slug, why: String(e.message || e).split('\n')[0].slice(0, 200), touched: [...done, s] }; }
  }
  return { failed: null, touched: done };
}

/** The weekly release hour (#1178): Wednesday 20:00 to 20:59 in India, after the 18:00 end of treatments. */
export function releaseHour(at) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at).map((x) => [x.type, x.value]));
  return p.weekday === 'Wed' && p.hour === '20';
}
