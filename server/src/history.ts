/**
 * One treatment's history, newest first, in the words the card shows (#136).
 * Read from the audit log the app already writes: an admin's edit is an
 * 'update' row on the appointment, and the app's own moves are 'replan' (a
 * therapist not in) and 'dayfix' (Verify's plan) batches that list it.
 */
import type { PrismaClient } from '@prisma/client';

export type Entry = { at: string; who: 'you' | 'the app'; text: string };

type Snapshot = Record<string, unknown>;

export async function historyOf(appointmentId: string, prisma: PrismaClient): Promise<Entry[] | null> {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) return null;
  const [rows, staff, rooms, therapies] = await Promise.all([
    // ponytail: batches are scanned since the booking, fine at one centre's volume; index writes by appointment if it grows.
    prisma.auditLog.findMany({
      where: {
        timestamp: { gte: appt.created_at },
        OR: [{ entity_type: 'appointment', entity_id: appointmentId, action: 'update' }, { action: { in: ['replan', 'dayfix'] } }],
      },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.staff.findMany({ select: { id: true, name: true } }),
    prisma.therapyRoom.findMany({ select: { id: true, name: true } }),
    prisma.therapy.findMany({ select: { id: true, name: true } }),
  ]);
  const nameIn = (list: { id: string; name: string }[], id: unknown) => list.find((x) => x.id === id)?.name || 'nobody';

  const describe = (before: Snapshot, after: Snapshot): string[] => {
    const out: string[] = [];
    if (after.status !== undefined && after.status !== before.status) {
      if (after.status === 'no_show') out.push("Marked didn't come");
      else if (after.status === 'cancelled') out.push('Cancelled');
      else if (before.status === 'no_show') out.push('Came after all');
      else if (before.status === 'cancelled') out.push('Put back');
    }
    if (after.scheduled_date !== undefined && String(after.scheduled_date).slice(0, 10) !== String(before.scheduled_date).slice(0, 10)) {
      out.push(`Moved to ${String(after.scheduled_date).slice(0, 10)}`);
    }
    if (after.start_time !== undefined && after.start_time !== before.start_time) out.push(`Start time changed from ${before.start_time} to ${after.start_time}`);
    if (after.staff_id !== undefined && after.staff_id !== before.staff_id) out.push(`Therapist changed from ${nameIn(staff, before.staff_id)} to ${nameIn(staff, after.staff_id)}`);
    if (after.room_id !== undefined && after.room_id !== before.room_id) out.push(`Room changed from ${nameIn(rooms, before.room_id)} to ${nameIn(rooms, after.room_id)}`);
    if (after.therapy_id !== undefined && after.therapy_id !== before.therapy_id) out.push(`Treatment changed from ${nameIn(therapies, before.therapy_id)} to ${nameIn(therapies, after.therapy_id)}`);
    if (after.notes !== undefined && (after.notes || '') !== (before.notes || '')) out.push(after.notes ? `Note: ${after.notes}` : 'Note removed');
    return out;
  };

  const entries: Entry[] = [];
  for (const r of rows) {
    const at = r.timestamp.toISOString();
    if (r.action === 'update') {
      for (const text of describe((r.old_value || {}) as Snapshot, (r.new_value || {}) as Snapshot)) entries.push({ at, who: 'you', text });
      continue;
    }
    const writes = (((r.old_value || {}) as { writes?: { appointment_id: string; before: Snapshot; after: Snapshot }[] }).writes || [])
      .filter((w) => w.appointment_id === appointmentId);
    const why = r.action === 'replan' ? ` (${((r.new_value || {}) as { staff_name?: string }).staff_name || 'a therapist'} not in)` : " (Verify's plan)";
    for (const w of writes) for (const text of describe(w.before || {}, w.after || {})) entries.push({ at, who: 'the app', text: text + why });
  }
  entries.push({ at: appt.created_at.toISOString(), who: appt.assignment_type === 'auto' ? 'the app' : 'you', text: `Booked: session ${appt.session_number} of ${appt.total_sessions}` });
  return entries;
}
