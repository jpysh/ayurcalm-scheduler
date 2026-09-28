declare module 'pdfkit';
import PDFDocument from 'pdfkit';
import type { PrismaClient } from '@prisma/client';

/**
 * What a resident takes home (#219): their stay, the treatments they had, and
 * the doctor's advice. Only what is useful to them: no rooms, no therapists'
 * rota, nothing the centre keeps for itself.
 */
export async function staySummary(patientId: string, stayId: string, prisma: PrismaClient, today: string) {
  const stay = await prisma.patientStay.findFirst({ where: { id: stayId, patient_id: patientId }, include: { Patient: true } });
  if (!stay) return null;
  const until = new Date(`${today}T00:00:00.000Z`);
  const appts = await prisma.appointment.findMany({
    where: {
      patient_id: stay.patient_id,
      scheduled_date: { gte: stay.start_date, lte: stay.end_date < until ? stay.end_date : until },
      status: { notIn: ['cancelled', 'no_show'] },
    },
    include: { Therapy: { select: { name: true, description: true, is_consultation: true } } },
  });
  const byTherapy = new Map<string, { name: string; description: string | null; times: number }>();
  for (const a of appts.filter((x) => !x.Therapy.is_consultation)) {
    const t = byTherapy.get(a.therapy_id) || { name: a.Therapy.name, description: a.Therapy.description, times: 0 };
    t.times++;
    byTherapy.set(a.therapy_id, t);
  }
  return {
    name: stay.Patient.name,
    from: stay.start_date.toISOString().slice(0, 10),
    to: stay.end_date.toISOString().slice(0, 10),
    treatments: [...byTherapy.values()].sort((a, b) => b.times - a.times || a.name.localeCompare(b.name)),
    consultations: appts.filter((x) => x.Therapy.is_consultation).length,
    vitals: stay.vitals,
    concerns: stay.concerns,
    tests: stay.tests,
    advice: stay.Patient.doctor_plan,
  };
}

const long = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export async function generateStaySummaryPdf(s: NonNullable<Awaited<ReturnType<typeof staySummary>>>, centreName: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: any) => chunks.push(Buffer.from(c)));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.font('Helvetica').fontSize(10).fillColor('#666').text(centreName);
  doc.moveDown(0.3).font('Helvetica-Bold').fontSize(20).fillColor('#000').text(s.name);
  doc.font('Helvetica').fontSize(11).text(`Your stay: ${long(s.from)} to ${long(s.to)}`);
  const section = (title: string, body?: string | null) => {
    if (!body) return;
    doc.moveDown(1).font('Helvetica-Bold').fontSize(13).text(title);
    doc.moveDown(0.3).font('Helvetica').fontSize(11).text(body);
  };
  section('What you came about', s.concerns);
  section('On arrival', s.vitals);
  doc.moveDown(1).font('Helvetica-Bold').fontSize(13).text('Your treatments');
  doc.moveDown(0.3).font('Helvetica').fontSize(11);
  if (!s.treatments.length) doc.text('None recorded.');
  for (const t of s.treatments) {
    doc.font('Helvetica-Bold').text(`${t.name}  ×${t.times}`, { continued: false });
    if (t.description) doc.font('Helvetica').fillColor('#444').text(t.description).fillColor('#000');
    doc.moveDown(0.3);
  }
  if (s.consultations) doc.font('Helvetica').text(`Consultations with the doctor: ${s.consultations}`);
  section("Your doctor's advice", s.advice);
  section('Tests to follow up', s.tests);
  doc.end();
  return done;
}
