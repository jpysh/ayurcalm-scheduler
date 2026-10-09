/**
 * The Log (#130): every change of the last 30 days, newest first, one sentence
 * each, read from the audit log that Undo and each treatment's History already
 * use. Only the newest batch can be undone from here, with the Undo that exists.
 */
import type { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { describer } from './history.js';

export type LogEntry = { id: string; at: string; who: 'you' | 'the app' | 'the guest'; text: string; undo: string | null; undone: boolean };

type Snap = Record<string, unknown>;
type Batch = { writes?: { appointment_id: string; before: Snap; after: Snap }[] };
type ReplanSummary = { staff_name?: string; moved?: { to: { staff_name: string } }[]; proposed?: unknown[]; unplaced?: unknown[] };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const listed = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const first = (name: string) => name.split(' ')[0];

export async function changeLog(days: number, prisma: PrismaClient): Promise<LogEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      timestamp: { gte: new Date(Date.now() - days * 86400000) },
      OR: [
        { action: { in: ['update', 'delete', 'replan', 'dayfix', 'replan_undone'] }, entity_type: { in: ['appointment', 'patient', 'staff'] } },
        { action: 'write' },
      ],
    },
    orderBy: { timestamp: 'desc' },
    take: 500,
  });
  const apptIds = [...new Set(rows.filter((r) => r.entity_type === 'appointment').flatMap((r) => [r.entity_id, ...((r.old_value as Batch | null)?.writes || []).map((w) => w.appointment_id)]))];
  const [appts, patients, staff, rooms, therapies] = await Promise.all([
    prisma.appointment.findMany({ where: { id: { in: apptIds } }, select: { id: true, patient_id: true, therapy_id: true, start_time: true } }),
    prisma.patient.findMany({ select: { id: true, name: true } }),
    prisma.staff.findMany({ select: { id: true, name: true } }),
    prisma.therapyRoom.findMany({ select: { id: true, name: true } }),
    prisma.therapy.findMany({ select: { id: true, name: true } }),
  ]);
  const name = (list: { id: string; name: string }[], id: unknown) => list.find((x) => x.id === id)?.name || '';
  const apptById = new Map(appts.map((a) => [a.id, a]));
  const describe = describer(staff, rooms, therapies);
  /** "Nisha Gupta's Abhyanga", from the treatment as it is now, or as it was when deleted. */
  const whose = (id: string, fallback?: Snap | null) => {
    const a = apptById.get(id) || (fallback as { patient_id?: string; therapy_id?: string } | null) || {};
    const who = name(patients, a.patient_id) || 'A patient';
    return `${who}'s ${name(therapies, a.therapy_id) || 'treatment'}`;
  };

  // An edit to a treatment deleted since says nothing the deletion's own line
  // does not: its record holds only the fields it changed, not whose it was.
  const shown = rows.filter((r) => !(r.action === 'update' && r.entity_type === 'appointment' && !apptById.has(r.entity_id)));
  const out: LogEntry[] = shown.map((r) => {
    const undone = r.action === 'replan_undone';
    const batch = r.action === 'replan' || r.action === 'dayfix' || undone;
    let text = '';
    if (r.action === 'write') {
      text = wrote((r.new_value || {}) as Wrote, { patients, staff, rooms, therapies }, whose);
    } else if (r.entity_type === 'patient') {
      const p = (r.old_value || {}) as { name?: string };
      text = r.action === 'delete' ? `${p.name || 'A patient'} removed` : `${name(patients, r.entity_id) || p.name || 'A patient'}'s details changed`;
    } else if (r.action === 'delete') {
      const a = (r.old_value || {}) as Snap;
      text = `${whose(r.entity_id, a)} at ${a.start_time || ''} on ${String(a.scheduled_date || '').slice(0, 10)} deleted`;
    } else if (r.action === 'update') {
      const lines = describe((r.old_value || {}) as Snap, (r.new_value || {}) as Snap);
      text = `${whose(r.entity_id)}: ${lines.join('; ') || 'changed'}`;
    } else if (r.entity_type === 'staff') {
      // A therapist not in: what the app did with their day.
      const s = (r.new_value || {}) as ReplanSummary;
      const to = [...new Set((s.moved || []).map((m) => first(m.to.staff_name)))];
      const left = (s.proposed || []).length + (s.unplaced || []).length;
      text = `${s.staff_name || 'A therapist'} not in: ${plural((s.moved || []).length, 'treatment')} given to ${listed(to) || 'nobody'}${left ? `, ${left} left to decide` : ''}`;
    } else {
      const writes = ((r.old_value || {}) as Batch).writes || [];
      const one = writes[0];
      text = writes.length === 1 && one
        ? `${whose(one.appointment_id)}: ${describe(one.before, one.after).join('; ') || 'changed'} (the day's check)`
        : `${plural(writes.length, 'change')} from the day's check`;
    }
    return {
      id: r.id, at: r.timestamp.toISOString(),
      who: batch ? 'the app' : r.admin_id === 'guest' ? 'the guest' : 'you',
      text: `${text}${undone ? ' (undone)' : ''}`,
      undo: null, undone,
    };
  });
  // Undo on the newest change only, and only when it is a batch the app can put back.
  const newest = shown[0];
  if (newest && (newest.action === 'replan' || newest.action === 'dayfix')) out[0].undo = newest.id;
  return out;
}

/**
 * Every write the admin makes is a Log row (#411). Routes that already write a
 * richer row with before and after (a treatment or patient edited or deleted,
 * the replan and the day check's fix) keep theirs; this records the rest once
 * the write has succeeded.
 * A delete keeps the row's name, read before it goes (#435), so the line says what went.
 * ponytail: keeps what was sent, not what it replaced; add before-values per route when Undo needs them.
 */
const OWN_ROW = [/^(PUT|DELETE) \/(appointments|patients)\/[^/]+$/, /^POST \/(replan|replan\/undo|day-check|day-check\/accept|client-errors|staff\/[^/]+\/hours-check)$/];
const SECRET = /password|token|secret|signature|logo/i;
const scrub = (v: unknown) => (Buffer.isBuffer(v) || v == null ? null : JSON.parse(JSON.stringify(v, (k, x) => (SECRET.test(k) ? undefined : typeof x === 'string' && x.length > 500 ? `${x.slice(0, 500)}…` : x))));

/** What a delete is about to remove: its name, or for a leave whose it was. */
async function removing(prisma: PrismaClient, kind: string, id: string): Promise<Record<string, unknown> | null> {
  const where = { where: { id } };
  if (kind === 'staff') return prisma.staff.findUnique({ ...where, select: { name: true } });
  if (kind === 'guest-rooms') return prisma.guestRoom.findUnique({ ...where, select: { name: true } });
  if (kind === 'rooms') return prisma.therapyRoom.findUnique({ ...where, select: { name: true } });
  if (kind === 'therapies') return prisma.therapy.findUnique({ ...where, select: { name: true } });
  if (kind === 'program-events') return prisma.programEvent.findUnique(where).then((e) => e && { name: e.activity_name });
  if (kind === 'timeoff' || kind === 'holidays') {
    const t = await prisma.timeOff.findUnique(where);
    return t && { entity_id: t.entity_id, name: t.entity_id ? undefined : t.description || t.date?.toISOString().slice(0, 10), start_date: (t.start_date ?? t.date)?.toISOString(), end_date: t.end_date?.toISOString() };
  }
  return null;
}

export const logWrites = (prisma: PrismaClient) => async (req: Request, res: Response, next: NextFunction) => {
  // Read now: a router mounted under /api rewrites req.path before the write finishes.
  const path = req.path;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || OWN_ROW.some((x) => x.test(`${req.method} ${path}`))) return next();
  // Sharing a link hands out the one there is; only a renewal changes anything (#461).
  if (/\/link$/.test(path) && req.query.renew !== '1') return next();
  const [, kind = '', id] = path.split('/');
  const was = req.method === 'DELETE' && id ? await removing(prisma, kind, id).catch(() => null)
    : req.method === 'PUT' && kind === 'settings' && !id ? await prisma.settings.findFirst().catch(() => null) : null;
  let sent: unknown;
  const json = res.json.bind(res);
  res.json = (b: unknown) => { sent = b; return json(b); };
  res.on('finish', () => {
    if (res.statusCode >= 300) return;
    const made = (sent as { id?: unknown } | null)?.id;
    prisma.auditLog.create({ data: {
      admin_id: req.user?.email || 'admin', action: 'write', entity_type: kind, entity_id: String(id || made || ''),
      new_value: { method: req.method, path, body: scrub(req.body), made: typeof made === 'string' ? made : null, was: scrub(was) },
    } }).catch(() => { /* the write itself succeeded; a lost Log row must not fail it */ });
  });
  next();
};

type Wrote = { method?: string; path?: string; body?: Record<string, unknown> | null; made?: string | null; was?: Record<string, unknown> | null };
type Named = { id: string; name: string }[];
const KIND: Record<string, string> = {
  staff: 'staff member', rooms: 'room', therapies: 'therapy', timeoff: 'leave', holidays: 'centre closed day', dietplans: 'diet plan',
  'program-events': 'event', users: 'user account', packages: 'package', accommodations: 'accommodation', 'guest-rooms': 'guest room', 'diet-templates': 'diet plan',
  patients: 'patient', appointments: 'treatment',
};
const cap = (x: string) => (x ? x[0].toUpperCase() + x.slice(1) : 'Something');

/** "Thu 8 Oct", as every screen says it; the Log showed the raw 2026-10-08 (#461). */
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');

/** One sentence for a write the middleware recorded. */
function wrote(w: Wrote, lists: { patients: Named; staff: Named; rooms: Named; therapies: Named }, whose: (id: string, fallback?: Snap | null) => string): string {
  const b = { ...w.was, ...w.body };
  const [, kind = '', id = '', sub = ''] = (w.path || '').split('/');
  const named = (x: unknown) => [lists.patients, lists.staff, lists.rooms, lists.therapies].map((l) => l.find((y) => y.id === x)?.name).find(Boolean) || '';
  const verb = w.method === 'POST' ? 'added' : w.method === 'DELETE' ? 'removed' : 'changed';
  if (kind === 'appointments') {
    // The booking sheet sends start_date and a time range; the card's quick book sends date and start_time.
    const on = b.date ?? b.start_date; const at = b.start_time ?? (b.preferred_time_range as { start?: string } | undefined)?.start;
    return `${whose(w.made || '', b)} booked${typeof on === 'string' ? ` for ${day(on)}` : ''}${typeof at === 'string' ? ` at ${at}` : ''}`;
  }
  if (kind === 'patients' && sub) {
    const who = named(id) || 'A patient';
    const what: Record<string, string> = { stays: `${who}'s stay changed`, diet: `${who}'s diet changed`, link: `${who}'s private link renewed, the old one stopped`, 'next-week': `Next week booked for ${who}` };
    const [, , , , , tail] = (w.path || '').split('/');
    if (sub === 'stays' && tail === 'form-c') return `${who}'s Form C marked ${b.filed === false ? 'not filed' : 'filed'}`;
    if (sub === 'stays' && !tail) {
      // What the stay sheets sent says which line changed: dates, the package, or the room (#499).
      const on = (x: unknown) => (typeof x === 'string' ? day(x) : '');
      if (w.method === 'POST') return `${who}'s stay added, ${on(b.start_date)} to ${on(b.end_date)}`;
      const parts = [
        ...(b.start_date || b.end_date ? [`dates ${on(b.start_date)} to ${on(b.end_date)}`] : []),
        ...('package_id' in b ? [b.package_id ? 'package set' : 'package cleared'] : []),
        ...('accommodation_id' in b ? [b.accommodation_id ? 'room set' : 'room cleared'] : []),
      ];
      if (parts.length) return `${who}'s stay: ${parts.join(', ')}`;
    }
    if (sub === 'passport-photo') return `${who}'s passport photo ${w.method === 'DELETE' ? 'removed' : 'kept'}`;
    if (sub === 'details') return `${who} filled in their own details: ${(Array.isArray(b.fields) ? b.fields as string[] : []).map((f) => f.replace(/_/g, ' ')).join(', ') || 'nothing new'}`;
    if ((w.path || '').endsWith('/arrival')) return `${who}'s arrival recorded`;
    if ((w.path || '').endsWith('/discharge')) return `${who}'s discharge recorded`;
    if ((w.path || '').endsWith('/follow-up')) return `${who}'s follow-up marked ${b.done ? 'done' : 'not done'}`;
    return what[sub] || `${who} changed`;
  }
  if (kind === 'staff' && sub === 'link') return `${named(id) || 'A staff member'}'s private link renewed, the old one stopped`;
  if (kind === 'users' && sub === 'set-password') return 'A password was set';
  if (kind === 'therapies' && id === 'import' && Array.isArray(b.items)) {
    const names = (b.items as { name?: string }[]).map((x) => x.name).filter(Boolean);
    return `${names.length} ${names.length === 1 ? 'therapy' : 'therapies'} added: ${names.join(', ')}`;
  }
  if (kind === 'timeoff' || kind === 'holidays') {
    const of = named(b.entity_id);
    const what = of ? ` for ${of}` : typeof b.name === 'string' ? ` ${b.name}` : '';
    // Leave without its dates said nothing about when (#479).
    const from = b.start_date ?? b.date; const to = b.end_date;
    const when = typeof from === 'string' ? `, ${day(from)}${typeof to === 'string' && to.slice(0, 10) !== from.slice(0, 10) ? ` to ${day(to)}` : ''}` : '';
    return `${cap(KIND[kind])}${what} ${verb}${when}`;
  }
  if (kind === 'settings' && id === 'setup-reviewed') return `Setup: ${typeof b.item === 'string' ? b.item.replace(/[-_]/g, ' ') : 'a part'} marked as reviewed`;
  if (kind === 'settings' && !id && w.was) {
    // Name what changed, not just 'Settings changed' (#479).
    const changed = Object.keys(w.body || {}).filter((k) => k !== 'updated_at' && JSON.stringify((w.body as Record<string, unknown>)[k]) !== JSON.stringify((w.was as Record<string, unknown>)[k]));
    if (changed.length) return `Settings changed: ${changed.slice(0, 3).map((k) => k.replace(/_/g, ' ')).join(', ')}${changed.length > 3 ? ` and ${changed.length - 3} more` : ''}`;
  }
  if (kind === 'settings') return ({ import: 'A backup restored', 'clear-demo-data': 'Example data cleared', 'reset-demo-data': 'Example data reset' } as Record<string, string>)[id] || 'Settings changed';
  if (kind === 'attention') return 'What needs you rules changed';
  if (kind === 'account') return 'Your password changed';
  if (kind === 'mcp-key') return 'The assistant key changed';
  const name = typeof b.name === 'string' ? b.name : named(id);
  return `${cap(KIND[kind] || kind.replace(/-/g, ' '))}${name ? ` ${name}` : ''} ${verb}`;
}
