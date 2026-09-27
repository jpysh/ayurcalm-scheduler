/**
 * Search every treatment, past and future, as a phone's calendar does (#165):
 * by the resident's, therapy's, room's or any therapist's name, over a window
 * of days, nearest first in each direction.
 */
import type { PrismaClient } from '@prisma/client';

export type Hit = {
  id: string; date: string; start_time: string; duration_minutes: number; status: string;
  patient_name: string; therapy_name: string; room_name: string | null; staff_names: string[];
};

export async function searchTreatments(q: string, from: Date, to: Date, prisma: PrismaClient): Promise<Hit[]> {
  const like = { contains: q, mode: 'insensitive' as const };
  const ids = async (rows: Promise<{ id: string }[]>) => (await rows).map((r) => r.id);
  const [patients, therapies, rooms, staff] = await Promise.all([
    ids(prisma.patient.findMany({ where: { name: like }, select: { id: true } })),
    ids(prisma.therapy.findMany({ where: { name: like }, select: { id: true } })),
    ids(prisma.therapyRoom.findMany({ where: { name: like }, select: { id: true } })),
    ids(prisma.staff.findMany({ where: { name: like }, select: { id: true } })),
  ]);
  // ponytail: capped at 300 rows; a centre searching a common word over a year sees the nearest 300.
  const rows = await prisma.appointment.findMany({
    where: {
      scheduled_date: { gte: from, lte: to },
      status: { not: 'cancelled' },
      OR: [
        { patient_id: { in: patients } }, { therapy_id: { in: therapies } }, { room_id: { in: rooms } },
        { staff_id: { in: staff } }, { co_staff_ids: { hasSome: staff } },
      ],
    },
    orderBy: [{ scheduled_date: 'asc' }, { start_time: 'asc' }],
    take: 300,
    include: { Patient: { select: { name: true } }, Therapy: { select: { name: true } }, Room: { select: { name: true } } },
  });
  const team = [...new Set(rows.flatMap((a) => [a.staff_id, ...a.co_staff_ids]).filter((x): x is string => Boolean(x)))];
  const names = new Map((await prisma.staff.findMany({ where: { id: { in: team } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  return rows.map((a) => ({
    id: a.id,
    date: a.scheduled_date.toISOString().slice(0, 10),
    start_time: a.start_time,
    duration_minutes: a.duration_minutes,
    status: a.status,
    patient_name: a.Patient.name,
    therapy_name: a.Therapy.name,
    room_name: a.Room?.name ?? null,
    staff_names: [a.staff_id, ...a.co_staff_ids].filter((x): x is string => Boolean(x)).map((id) => names.get(id) || ''),
  }));
}
