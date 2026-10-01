/**
 * A patient's meals by date (#285 story 7): the plans they follow through a stay, each
 * starting where the last ended and the last running to the leaving date. Storage is the
 * DietPlanSegment table the day sheet already reads; this only keeps the segments tidy.
 */
import type { PrismaClient } from '@prisma/client';

const DAY_MS = 86400000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const before = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - DAY_MS);

/** How many patients still have each plan ahead of them or under way: the number an edit to a plan reaches. */
export async function patientsOnPlans(prisma: PrismaClient) {
  const zone = (await prisma.settings.findUnique({ where: { id: 'singleton' } }))?.timezone || 'Asia/Kolkata';
  const today = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date())}T00:00:00.000Z`);
  const rows = await prisma.dietPlanSegment.findMany({ where: { end_date: { gte: today }, template_id: { not: null } }, select: { template_id: true, patient_id: true } });
  const sets = new Map<string, Set<string>>();
  for (const r of rows) sets.set(r.template_id!, (sets.get(r.template_id!) ?? new Set()).add(r.patient_id));
  return new Map([...sets].map(([id, who]) => [id, who.size]));
}

/** The stay a date falls in, else the next one to come, else the last one. */
export async function stayFor(patientId: string, date: string, prisma: PrismaClient) {
  const day = new Date(`${date}T00:00:00.000Z`);
  return (await prisma.patientStay.findFirst({ where: { patient_id: patientId, start_date: { lte: day }, end_date: { gte: day } } }))
    ?? (await prisma.patientStay.findFirst({ where: { patient_id: patientId, start_date: { gt: day } }, orderBy: { start_date: 'asc' } }))
    ?? (await prisma.patientStay.findFirst({ where: { patient_id: patientId }, orderBy: { end_date: 'desc' } }));
}

/** The timeline inside one stay, with a gap shown as "not decided" so nothing is silently blank. */
export async function dietTimeline(patientId: string, date: string, prisma: PrismaClient) {
  const stay = await stayFor(patientId, date, prisma);
  if (!stay) return null;
  const segs = await prisma.dietPlanSegment.findMany({
    where: { patient_id: patientId, start_date: { lte: stay.end_date }, end_date: { gte: stay.start_date } },
    orderBy: { start_date: 'asc' },
    include: { Template: { select: { id: true, name: true } } },
  });
  const users = await patientsOnPlans(prisma);
  const from = ymd(stay.start_date);
  const entries = segs.map((s, i) => {
    const start = s.start_date < stay.start_date ? from : ymd(s.start_date);
    const next = segs[i + 1];
    return {
      id: s.id, from: start,
      // Each runs until the next begins, and the last to the leaving date.
      to: next ? ymd(before(ymd(next.start_date))) : ymd(stay.end_date),
      template_id: s.template_id,
      name: s.Template?.name || s.template_label || 'Own plan',
      patients: users.get(s.template_id ?? '') ?? 0,
      changed_for_patient: !!s.overrides && Object.keys(s.overrides as object).length > 0,
    };
  });
  if (!entries.length || entries[0].from > from) entries.unshift({ id: '', from, to: entries[0] ? ymd(before(entries[0].from)) : ymd(stay.end_date), template_id: null, name: 'Not decided yet', patients: 0, changed_for_patient: false });
  return { stay: { id: stay.id, start: from, end: ymd(stay.end_date) }, entries };
}

/**
 * Start a plan on a date: whatever ran from then on is replaced, whatever ran before is
 * ended the day before. Nothing else about the earlier plan changes.
 */
export async function startDietFrom(patientId: string, from: string, templateId: string, prisma: PrismaClient) {
  const stay = await stayFor(patientId, from, prisma);
  const day = new Date(`${from}T00:00:00.000Z`);
  if (!stay || day < stay.start_date || day > stay.end_date) return { error: 'That date is outside their stay.' as const };
  const template = await prisma.dietTemplate.findUnique({ where: { id: templateId } });
  if (!template) return { error: 'That plan does not exist.' as const };
  await prisma.$transaction([
    prisma.dietPlanSegment.deleteMany({ where: { patient_id: patientId, start_date: { gte: day, lte: stay.end_date } } }),
    prisma.dietPlanSegment.updateMany({ where: { patient_id: patientId, start_date: { lt: day }, end_date: { gte: day } }, data: { end_date: before(from) } }),
    prisma.dietPlanSegment.create({ data: { patient_id: patientId, start_date: day, end_date: stay.end_date, template_id: templateId } }),
  ]);
  return { ok: true as const };
}

/** A stay that now ends later: the plan that ran to the old leaving date runs to the new one. */
export async function extendDiet(patientId: string, oldEnd: Date, newEnd: Date, prisma: PrismaClient) {
  if (newEnd <= oldEnd) return;
  await prisma.dietPlanSegment.updateMany({ where: { patient_id: patientId, end_date: oldEnd }, data: { end_date: newEnd } });
}
