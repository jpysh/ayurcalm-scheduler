/**
 * Search every treatment, past and future, as a phone's calendar does (#165):
 * by the resident's, therapy's, room's or any therapist's name, over a window
 * of days, nearest first in each direction.
 */
import type { PrismaClient } from '@prisma/client';

/** The appointment as the treatment card reads it, with the names the list shows. */
export type Hit = Record<string, unknown> & {
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
  // ponytail: capped at 150 rows each side of the window's middle (the screen
  // sends today ± the same number of days), so a common word finds the nearest
  // treatments both ways. Taking the earliest 300 lost every upcoming one once
  // a busy window passed 300 matches.
  const middle = new Date((from.getTime() + to.getTime()) / 2);
  middle.setUTCHours(0, 0, 0, 0);
  const match = {
    status: { not: 'cancelled' as const },
    OR: [
      { patient_id: { in: patients } }, { therapy_id: { in: therapies } }, { room_id: { in: rooms } },
      { staff_id: { in: staff } }, { co_staff_ids: { hasSome: staff } },
    ],
  };
  const include = { Patient: { select: { name: true } }, Therapy: { select: { name: true } }, Room: { select: { name: true } } };
  const [later, earlier] = await Promise.all([
    prisma.appointment.findMany({ where: { ...match, scheduled_date: { gte: middle, lte: to } }, orderBy: [{ scheduled_date: 'asc' }, { start_time: 'asc' }], take: 150, include }),
    prisma.appointment.findMany({ where: { ...match, scheduled_date: { gte: from, lt: middle } }, orderBy: [{ scheduled_date: 'desc' }, { start_time: 'desc' }], take: 150, include }),
  ]);
  const rows = [...earlier.reverse(), ...later];
  const team = [...new Set(rows.flatMap((a) => [a.staff_id, ...a.co_staff_ids]).filter((x): x is string => Boolean(x)))];
  const names = new Map((await prisma.staff.findMany({ where: { id: { in: team } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  return rows.map(({ Patient, Therapy, Room, ...a }) => ({
    ...a,
    date: a.scheduled_date.toISOString().slice(0, 10),
    patient_name: Patient.name,
    therapy_name: Therapy.name,
    room_name: Room?.name ?? null,
    staff_names: [a.staff_id, ...a.co_staff_ids].filter((x): x is string => Boolean(x)).map((id) => names.get(id) || ''),
  }));
}

/** A patient whose name matches, for the top of typed results (#412): in house first, then arriving, then past guests. */
export type PatientHit = { id: string; name: string; when: 'in' | 'arriving' | 'past' | 'none'; start: string | null; end: string | null; room: string | null; diet: string | null };

export async function searchPatients(q: string, today: Date, prisma: PrismaClient): Promise<PatientHit[]> {
  const found = await prisma.patient.findMany({
    where: { name: { contains: q, mode: 'insensitive' } },
    select: {
      id: true, name: true,
      Stays: { orderBy: { end_date: 'desc' }, take: 1, select: { start_date: true, end_date: true, GuestRoom: { select: { name: true } }, Accommodation: { select: { name: true } } } },
      DietPlanSegments: { where: { start_date: { lte: today }, end_date: { gte: today } }, take: 1, select: { template_label: true, Template: { select: { name: true } } } },
    },
    take: 20,
  });
  const rank = { in: 0, arriving: 1, past: 2, none: 3 };
  return found.map((p) => {
    const s = p.Stays[0];
    const when: PatientHit['when'] = !s ? 'none' : s.start_date > today ? 'arriving' : s.end_date < today ? 'past' : 'in';
    const d = p.DietPlanSegments[0];
    return {
      id: p.id, name: p.name, when,
      start: s ? s.start_date.toISOString().slice(0, 10) : null, end: s ? s.end_date.toISOString().slice(0, 10) : null,
      room: s ? [s.Accommodation?.name, s.GuestRoom?.name].filter(Boolean).join(' ') || null : null,
      diet: when === 'in' ? d?.Template?.name || d?.template_label || null : null,
    };
  }).sort((a, b) => rank[a.when] - rank[b.when] || a.name.localeCompare(b.name));
}
