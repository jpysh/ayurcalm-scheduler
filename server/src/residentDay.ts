/**
 * One resident's day, for the resident card (#63, docs/design/phone.html): the
 * stay it falls in, today's treatments, and what they eat today with the plan
 * it comes from. Meals resolve through the same code as the day sheet, so the
 * card and the notice board cannot disagree.
 */
import type { PrismaClient } from '@prisma/client';
import { loadDietsForDay, mealLabel, mealOrder } from './dietResolution.js';

const DAY_MS = 86400000;

export async function residentDay(patientId: string, date: string, prisma: PrismaClient) {
  const day = new Date(`${date}T00:00:00.000Z`);
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return null;
  const [stay, appts, diets] = await Promise.all([
    prisma.patientStay.findFirst({ where: { patient_id: patientId, start_date: { lte: day }, end_date: { gte: day } } }),
    // A no-show stays on the card, marked; a cancellation does not.
    prisma.appointment.findMany({
      where: { patient_id: patientId, scheduled_date: day, status: { not: 'cancelled' } },
      orderBy: { start_time: 'asc' },
      include: { Therapy: { select: { name: true } }, Room: { select: { name: true } } },
    }),
    loadDietsForDay(day, prisma),
  ]);
  const team = [...new Set(appts.flatMap((a) => [a.staff_id, ...a.co_staff_ids]).filter((x): x is string => Boolean(x)))];
  const names = new Map((await prisma.staff.findMany({ where: { id: { in: team } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  const diet = diets.dietFor(patient, appts.some((a) => a.status !== 'no_show'));
  return {
    id: patient.id,
    name: patient.name,
    stay: stay && {
      id: stay.id,
      start_date: stay.start_date.toISOString().slice(0, 10),
      end_date: stay.end_date.toISOString().slice(0, 10),
      day: Math.round((day.getTime() - stay.start_date.getTime()) / DAY_MS) + 1,
      days: Math.round((stay.end_date.getTime() - stay.start_date.getTime()) / DAY_MS) + 1,
    },
    treatments: appts.map(({ Therapy, Room, ...a }) => ({
      ...a,
      therapy_name: Therapy.name,
      room_name: Room?.name ?? null,
      staff_names: [a.staff_id, ...a.co_staff_ids].filter((x): x is string => Boolean(x)).map((id) => names.get(id) || ''),
    })),
    plan_name: diet.planName,
    meals: mealOrder.filter((m) => diet.meals[m]).map((m) => ({ meal: mealLabel[m], text: diet.meals[m]! })),
  };
}
