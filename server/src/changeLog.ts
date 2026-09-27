/**
 * The Log (#130): every change of the last 30 days, newest first, one sentence
 * each, read from the audit log that Undo and each treatment's History already
 * use. Only the newest batch can be undone from here, with the Undo that exists.
 */
import type { PrismaClient } from '@prisma/client';
import { describer } from './history.js';

export type LogEntry = { id: string; at: string; who: 'you' | 'the app'; text: string; undo: string | null; undone: boolean };

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
      action: { in: ['update', 'delete', 'replan', 'dayfix', 'replan_undone'] },
      entity_type: { in: ['appointment', 'patient', 'staff'] },
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
    const who = name(patients, a.patient_id) || 'A resident';
    return `${who}'s ${name(therapies, a.therapy_id) || 'treatment'}`;
  };

  const out: LogEntry[] = rows.map((r) => {
    const undone = r.action === 'replan_undone';
    const batch = r.action === 'replan' || r.action === 'dayfix' || undone;
    let text = '';
    if (r.entity_type === 'patient') {
      const p = (r.old_value || {}) as { name?: string };
      text = r.action === 'delete' ? `${p.name || 'A resident'} removed` : `${name(patients, r.entity_id) || p.name || 'A resident'}'s details changed`;
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
      who: batch ? 'the app' : 'you',
      text: `${text}${undone ? ' (undone)' : ''}`,
      undo: null, undone,
    };
  });
  // Undo on the newest change only, and only when it is a batch the app can put back.
  const newest = rows[0];
  if (newest && (newest.action === 'replan' || newest.action === 'dayfix')) out[0].undo = newest.id;
  return out;
}
