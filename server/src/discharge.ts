/**
 * The discharge summary (#194), modelled on the report a real centre hands a
 * resident. What the doctor or admin writes lives as one JSON object on the
 * stay; everything the app already knows (name, dates, treatments day by day,
 * BP from the treatment records) is read fresh when the summary is built, so
 * the two cannot drift.
 */
import { z } from 'zod';
import { Prisma, type PrismaClient } from '@prisma/client';

const DAY_MS = 86400000;
const line = z.string().trim().max(200).default('');
const para = z.string().trim().max(2000).default('');

export const medSchema = z.object({
  name: z.string().trim().min(1).max(120),
  dose: z.string().trim().max(40).default(''),     // "1-X-1", "10 ml twice"
  timing: z.string().trim().max(60).default(''),   // "after food"
  from: z.string().trim().max(20).default(''),     // a date, or empty for the whole period
  days: z.string().trim().max(20).default(''),
});
export type Med = z.infer<typeof medSchema>;

export const dischargeSchema = z.object({
  admitted_time: line, discharged_time: line,
  registration_no: line, address: line, country: line, passport: line,
  payment_amount: line, payment_mode: line, payment_date: line,
  weight: line, bp: line, bowel: line, appetite: line, sleep: line, menstrual: line, dosha: line,
  discharge_type: line, condition: para, diagnosis: para, reason: para, investigations: para,
  meds_stay: z.array(medSchema).max(30).default([]),
  meds_home: z.array(medSchema).max(30).default([]),
  meds_home_for: line,
  instructions: para, follow_up: para, urgent_when: para, urgent_how: para,
  doctor_id: z.string().uuid().nullable().default(null),
  signed_at: line,
});
export type Discharge = z.infer<typeof dischargeSchema> & { no: string; final: boolean };

export const letterheadSchema = z.object({
  seal_logo: z.string().max(1_400_000).refine((v) => !v || v.startsWith('data:image/'), 'Seal must be an image').default(''),
  name_local: line, registration_line: line, accreditation_line: line,
  phones: line, email: line, website: line, footer_line: z.string().trim().max(300).default(''),
  // {YYYY} is the year of discharge, {N} counts discharges.
  discharge_format: z.string().trim().max(40).default('DS/{YYYY}/{N}'),
});
export type Letterhead = z.infer<typeof letterheadSchema>;
export const letterheadOf = (json: unknown): Letterhead => letterheadSchema.parse(json ?? {});

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const lastBp = (record: unknown) => ((record || {}) as { vitals?: { bp?: string } }).vitals?.bp || '';

/** The first free-text reading on arrival looks like "BP 130/85, pulse 72, weight 68 kg". */
const fromVitals = (vitals: string | null, key: 'bp' | 'weight') => {
  const m = key === 'bp' ? vitals?.match(/BP\s*([\d/]+)/i) : vitals?.match(/weight\s*([\d.]+\s*kg)/i);
  return m?.[1] || '';
};

/** Everything the summary needs, the stored draft filled in with what the app knows. */
export async function dischargeOf(stayId: string, prisma: PrismaClient) {
  const stay = await prisma.patientStay.findUnique({ where: { id: stayId }, include: { Patient: true } });
  if (!stay) return null;
  const appts = await prisma.appointment.findMany({
    where: { patient_id: stay.patient_id, scheduled_date: { gte: stay.start_date, lte: stay.end_date }, status: { notIn: ['cancelled', 'no_show'] } },
    orderBy: [{ scheduled_date: 'asc' }, { start_time: 'asc' }],
    include: { Therapy: { select: { name: true, is_consultation: true } } },
  });
  const days = Math.round((stay.end_date.getTime() - stay.start_date.getTime()) / DAY_MS) + 1;
  const table = Array.from({ length: days }, (_, i) => {
    const date = ymd(new Date(stay.start_date.getTime() + i * DAY_MS));
    const those = appts.filter((a) => ymd(a.scheduled_date) === date);
    return {
      date, day: i + 1,
      items: those.map((a) => ({ name: a.Therapy.name, consultation: a.Therapy.is_consultation })),
      bp: those.map((a) => lastBp(a.record)).filter(Boolean).pop() || '',
    };
  });
  const consultations = appts.filter((a) => a.Therapy.is_consultation);
  const stored = (stay.discharge || {}) as Partial<Discharge>;
  const recordedBp = table.map((r) => r.bp).filter(Boolean);
  const draft: Discharge = {
    ...dischargeSchema.parse({
      admitted_time: '09:00', discharged_time: '11:00',
      bp: recordedBp[recordedBp.length - 1] || fromVitals(stay.vitals, 'bp'),
      weight: fromVitals(stay.vitals, 'weight'),
      discharge_type: 'Normal',
      condition: 'Stable. All vitals stable at the time of discharge.',
      reason: stay.concerns || '',
      investigations: stay.tests || '',
      instructions: stay.Patient.doctor_plan || '',
      doctor_id: consultations[consultations.length - 1]?.staff_id ?? null,
      signed_at: `${ymd(stay.end_date)} 11:00`,
    }),
    no: '', final: false,
    ...stored,
  };
  const doctor = draft.doctor_id ? await prisma.staff.findUnique({ where: { id: draft.doctor_id }, select: { id: true, name: true, qualification: true, reg_no: true, signature: true, phone: true } }) : null;
  const p = stay.Patient;
  const age = p.date_of_birth ? Math.floor((stay.end_date.getTime() - p.date_of_birth.getTime()) / (365.25 * DAY_MS)) : null;
  return {
    stay_id: stay.id, patient_id: p.id, saved: !!stay.discharge,
    name: p.name, gender: p.gender, age, phone: p.phone, email: p.email,
    from: ymd(stay.start_date), to: ymd(stay.end_date), days,
    table, draft, doctor,
  };
}
export type DischargeView = NonNullable<Awaited<ReturnType<typeof dischargeOf>>>;

/**
 * Saves what the doctor or admin wrote. The number is given on the first save
 * and never changes. A summary the admin has marked final is closed to the
 * doctor's link: the admin has the last word.
 */
export async function saveDischarge(stayId: string, body: unknown, by: 'admin' | 'doctor', prisma: PrismaClient) {
  const stay = await prisma.patientStay.findUnique({ where: { id: stayId } });
  if (!stay) return { error: 404 as const };
  const before = (stay.discharge || {}) as Partial<Discharge>;
  if (by === 'doctor' && before.final) return { error: 409 as const };
  const input = dischargeSchema.partial().extend({ final: z.boolean().optional() }).strict().parse(body);
  if (by === 'doctor') delete input.final;
  let no = before.no;
  if (!no) {
    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    const count = await prisma.patientStay.count({ where: { discharge: { not: Prisma.DbNull } } });
    no = letterheadOf(settings?.letterhead).discharge_format
      .replace('{YYYY}', String(stay.end_date.getUTCFullYear()))
      .replace('{N}', String(count + 1).padStart(4, '0'));
  }
  // A field the caller did not send is left as it is.
  const sent = Object.fromEntries(Object.entries(input).filter(([k]) => k in (body as object)));
  const next = { ...before, ...sent, no, final: input.final ?? before.final ?? false };
  await prisma.patientStay.update({ where: { id: stayId }, data: { discharge: next as Prisma.InputJsonValue } });
  return { ok: true as const };
}
