/**
 * One resident's day, for the resident card (#63, docs/design/phone.html): the
 * stay it falls in, today's treatments, the week ahead (#350), and what they eat today with the plan
 * it comes from. Meals resolve through the same code as the day sheet, so the
 * card and the notice board cannot disagree.
 */
import type { PrismaClient } from '@prisma/client';
import { loadDietsForDay, mealLabel, mealOrder } from './dietResolution.js';
import { centreClock, startedBefore, toMinutes } from './availability.js';
import { dischargeOf } from './discharge.js';
import { formCDue, isForeign } from './attention.js';

const DAY_MS = 86400000;

export async function residentDay(patientId: string, date: string, prisma: PrismaClient) {
  const day = new Date(`${date}T00:00:00.000Z`);
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return null;
  // Seven days from today: the weekly doctor review plans about that far ahead (#348).
  const weekEnd = new Date(day.getTime() + 6 * DAY_MS);
  const [stay, ahead, diets] = await Promise.all([
    prisma.patientStay.findFirst({ where: { patient_id: patientId, start_date: { lte: day }, end_date: { gte: day } } }),
    // A no-show stays on the card, marked; a cancellation does not.
    prisma.appointment.findMany({
      where: { patient_id: patientId, scheduled_date: { gte: day, lte: weekEnd }, status: { not: 'cancelled' } },
      orderBy: [{ scheduled_date: 'asc' }, { start_time: 'asc' }],
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
  const appts = ahead.filter((a) => a.scheduled_date.getTime() === day.getTime());
  // The days the stay covers, each with what is booked, so an empty one shows (#350).
  // Not staying, there is nothing to book and no week to show (#437).
  const lastDay = stay ? (stay.end_date < weekEnd ? stay.end_date : weekEnd) : new Date(day.getTime() - DAY_MS);
  const week = [];
  for (let t = day.getTime(); t <= lastDay.getTime(); t += DAY_MS) {
    const iso = new Date(t).toISOString().slice(0, 10);
    week.push({ date: iso, treatments: ahead.filter((a) => a.scheduled_date.getTime() === t).map((a) => ({ id: a.id, start_time: a.start_time, therapy_name: a.Therapy.name, consultation: a.Therapy.is_consultation, status: a.status })) });
  }
  const visit = (a: (typeof visits)[number] | null) => a && { id: a.id, date: a.scheduled_date.toISOString().slice(0, 10), start_time: a.start_time, doctor: a.Staff?.name ?? null, note: a.notes };
  const team = [...new Set(appts.flatMap((a) => [a.staff_id, ...a.co_staff_ids]).filter((x): x is string => Boolean(x)))];
  const names = new Map((await prisma.staff.findMany({ where: { id: { in: team } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  const diet = diets.dietFor(patient, appts.some((a) => a.status !== 'no_show'));
  // The plan that takes over later in the stay, so the Diet row can say "then X from 5 Oct".
  const nextSeg = stay ? await prisma.dietPlanSegment.findFirst({ where: { patient_id: patientId, start_date: { gt: day, lte: stay.end_date } }, orderBy: { start_date: 'asc' }, include: { Template: { select: { name: true } } } }) : null;
  // A guest whose stay starts later has the card of that stay: what it needs before they arrive (#495).
  const comingStay = stay ? null : await prisma.patientStay.findFirst({ where: { patient_id: patientId, start_date: { gt: day } }, orderBy: { start_date: 'asc' } });
  const up = stay ?? comingStay;
  const [pack, house, discharge] = up ? await Promise.all([
    up.package_id ? prisma.package.findUnique({ where: { id: up.package_id } }) : null,
    up.accommodation_id ? prisma.accommodationType.findUnique({ where: { id: up.accommodation_id } }) : null,
    dischargeOf(up.id, prisma),
  ]) : [null, null, null];
  const room = up?.guest_room_id ? await prisma.guestRoom.findUnique({ where: { id: up.guest_room_id }, select: { id: true, name: true } }) : null;
  // A past guest (#437): when they left and on what package, so New stay starts from it.
  // One already coming is not a past guest.
  const before = up ? null : await prisma.patientStay.findFirst({ where: { patient_id: patientId, end_date: { lt: day } }, orderBy: { end_date: 'desc' } });
  const beforePack = before?.package_id ? await prisma.package.findUnique({ where: { id: before.package_id } }) : null;
  // The follow-up the last discharge asked for (#487), on the card of a guest who has left.
  const ended = await prisma.patientStay.findFirst({ where: { patient_id: patientId, end_date: { lte: day } }, orderBy: { end_date: 'desc' } });
  const fuDate = (ended?.discharge as { follow_up_date?: string } | null)?.follow_up_date;
  const follow_up = ended && fuDate ? { stay_id: ended.id, due: fuDate, phone: patient.phone ?? null, centre: settings?.centre_name ?? '', done: ended.follow_up_done ? centreClock(settings?.timezone || 'Asia/Kolkata', ended.follow_up_done).date : null } : null;
  const shape = (s: NonNullable<typeof up>) => ({
    id: s.id,
    start_date: s.start_date.toISOString().slice(0, 10),
    end_date: s.end_date.toISOString().slice(0, 10),
    day: Math.round((day.getTime() - s.start_date.getTime()) / DAY_MS) + 1,
    days: Math.round((s.end_date.getTime() - s.start_date.getTime()) / DAY_MS) + 1,
    vitals: s.vitals, concerns: s.concerns, tests: s.tests, on_site: s.on_site,
    package: pack && { id: pack.id, name: pack.name, days: pack.days, price: pack.price },
    accommodation: house && { id: house.id, name: house.name, price_per_day: house.price_per_day, room },
    discharge: discharge?.ready ?? null,
  });
  return {
    follow_up,
    id: patient.id,
    name: patient.name,
    stay: stay && shape(stay),
    coming: comingStay && shape(comingStay),
    treatments: appts.map(({ Therapy, Room, ...a }) => ({
      ...a,
      therapy_name: Therapy.name,
      consultation: Therapy.is_consultation,
      room_name: Room?.name ?? null,
      staff_names: [a.staff_id, ...a.co_staff_ids].filter((x): x is string => Boolean(x)).map((id) => names.get(id) || ''),
    })),
    week,
    // What the FRRO site asks for, in its order, so each can be copied across (#415).
    form_c: up && isForeign(patient.country) ? {
      due: formCDue(up.start_date), filed: up.form_c_filed ? centreClock(settings?.timezone || 'Asia/Kolkata', up.form_c_filed).date : null,
      fields: [
        ['Name', patient.name], ['Gender', patient.gender[0].toUpperCase() + patient.gender.slice(1)], ['Date of birth', patient.date_of_birth?.toISOString().slice(0, 10) ?? ''],
        ['Nationality', patient.country ?? ''], ['Passport', patient.id_number ?? ''], ['Visa number', patient.visa_number ?? ''],
        ['Visa valid until', patient.visa_valid_until ?? ''], ['Arrived', up.start_date.toISOString().slice(0, 10)],
        ['Leaving', up.end_date.toISOString().slice(0, 10)], ['Address at home', patient.address ?? ''], ['Phone', patient.phone ?? ''],
      ],
    } : null,
    last_stay: before && { end_date: before.end_date.toISOString().slice(0, 10), package: beforePack && { id: beforePack.id, name: beforePack.name, days: beforePack.days, price: beforePack.price } },
    doctor_plan: patient.doctor_plan,
    last_consultation: visit(last),
    next_consultation: visit(next),
    plan_name: diet.planName,
    diet_next: nextSeg && { from: nextSeg.start_date.toISOString().slice(0, 10), name: nextSeg.Template?.name || nextSeg.template_label || 'Own plan' },
    meals: mealOrder.filter((m) => diet.meals[m]).map((m) => ({ meal: mealLabel[m], text: diet.meals[m]! })),
  };
}
