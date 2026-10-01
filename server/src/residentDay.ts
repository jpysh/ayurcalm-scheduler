/**
 * One resident's day, for the resident card (#63, docs/design/phone.html): the
 * stay it falls in, today's treatments, and what they eat today with the plan
 * it comes from. Meals resolve through the same code as the day sheet, so the
 * card and the notice board cannot disagree.
 */
import type { PrismaClient } from '@prisma/client';
import { loadDietsForDay, mealLabel, mealOrder } from './dietResolution.js';
import { centreClock, startedBefore, toMinutes } from './availability.js';
import { dischargeOf } from './discharge.js';

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
      include: { Therapy: { select: { name: true, is_consultation: true } }, Room: { select: { name: true } } },
    }),
    loadDietsForDay(day, prisma),
  ]);
  // The doctor's side of the card (#219): the last consultation before today,
  // the next one from today, and the plan the last one left.
  const consult = { patient_id: patientId, status: { notIn: ['cancelled', 'no_show'] as ('cancelled' | 'no_show')[] }, Therapy: { is_consultation: true } };
  const include = { Staff: { select: { name: true } } };
  // Split at the centre's clock, so this morning's consultation is the last one by the afternoon.
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const cut = startedBefore(centreClock(settings?.timezone || 'Asia/Kolkata'), day);
  const visits = await prisma.appointment.findMany({ where: consult, orderBy: [{ scheduled_date: 'asc' }, { start_time: 'asc' }], include });
  const held = (a: (typeof visits)[number]) => {
    const d = a.scheduled_date.toISOString().slice(0, 10);
    return d < date || (d === date && toMinutes(a.start_time) + a.duration_minutes <= cut);
  };
  const past = visits.filter(held);
  const last = past[past.length - 1] ?? null;
  const next = visits.find((a) => !held(a)) ?? null;
  const visit = (a: (typeof visits)[number] | null) => a && { id: a.id, date: a.scheduled_date.toISOString().slice(0, 10), start_time: a.start_time, doctor: a.Staff?.name ?? null, note: a.notes };
  const team = [...new Set(appts.flatMap((a) => [a.staff_id, ...a.co_staff_ids]).filter((x): x is string => Boolean(x)))];
  const names = new Map((await prisma.staff.findMany({ where: { id: { in: team } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  const diet = diets.dietFor(patient, appts.some((a) => a.status !== 'no_show'));
  // The plan that takes over later in the stay, so the Diet row can say "then X from 5 Oct".
  const nextSeg = stay ? await prisma.dietPlanSegment.findFirst({ where: { patient_id: patientId, start_date: { gt: day, lte: stay.end_date } }, orderBy: { start_date: 'asc' }, include: { Template: { select: { name: true } } } }) : null;
  const [pack, house, discharge] = stay ? await Promise.all([
    stay.package_id ? prisma.package.findUnique({ where: { id: stay.package_id } }) : null,
    stay.accommodation_id ? prisma.accommodationType.findUnique({ where: { id: stay.accommodation_id } }) : null,
    dischargeOf(stay.id, prisma),
  ]) : [null, null, null];
  return {
    id: patient.id,
    name: patient.name,
    stay: stay && {
      id: stay.id,
      start_date: stay.start_date.toISOString().slice(0, 10),
      end_date: stay.end_date.toISOString().slice(0, 10),
      day: Math.round((day.getTime() - stay.start_date.getTime()) / DAY_MS) + 1,
      days: Math.round((stay.end_date.getTime() - stay.start_date.getTime()) / DAY_MS) + 1,
      vitals: stay.vitals, concerns: stay.concerns, tests: stay.tests, on_site: stay.on_site,
      package: pack && { id: pack.id, name: pack.name, days: pack.days, price: pack.price },
      accommodation: house && { id: house.id, name: house.name, price_per_day: house.price_per_day, room_number: stay.room_number },
      discharge: discharge?.ready ?? null,
    },
    treatments: appts.map(({ Therapy, Room, ...a }) => ({
      ...a,
      therapy_name: Therapy.name,
      consultation: Therapy.is_consultation,
      room_name: Room?.name ?? null,
      staff_names: [a.staff_id, ...a.co_staff_ids].filter((x): x is string => Boolean(x)).map((id) => names.get(id) || ''),
    })),
    doctor_plan: patient.doctor_plan,
    last_consultation: visit(last),
    next_consultation: visit(next),
    plan_name: diet.planName,
    diet_next: nextSeg && { from: nextSeg.start_date.toISOString().slice(0, 10), name: nextSeg.Template?.name || nextSeg.template_label || 'Own plan' },
    meals: mealOrder.filter((m) => diet.meals[m]).map((m) => ({ meal: mealLabel[m], text: diet.meals[m]! })),
  };
}
