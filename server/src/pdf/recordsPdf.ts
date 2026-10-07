import PDFDocument from 'pdfkit';
import { PrismaClient } from '@prisma/client';
import { madeWith } from '../product.js';

const DAY_MS = 86400000;
const nice = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');

/**
 * Records for a month (#488, story s35): what an inspector asks for, one
 * readable file. Each patient who stayed in the month, in arrival order: their
 * stay, the discharge summary's number, and the treatments given that month.
 * `month` is YYYY-MM.
 */
export async function generateRecordsPdf(month: string, prisma: PrismaClient): Promise<Buffer> {
  const from = new Date(`${month}-01T00:00:00.000Z`);
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1) - DAY_MS);
  const margin = 40;
  const doc = new PDFDocument({ size: 'A4', margins: { top: margin, bottom: margin, left: margin, right: margin } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const [stays, appts] = await Promise.all([
    prisma.patientStay.findMany({ where: { start_date: { lte: to }, end_date: { gte: from } }, include: { Patient: true }, orderBy: [{ start_date: 'asc' }] }),
    prisma.appointment.findMany({ where: { scheduled_date: { gte: from, lte: to } }, include: { Therapy: { select: { name: true, is_consultation: true } }, Staff: { select: { name: true } } } }),
  ]);

  const x = margin;
  const w = doc.page.width - 2 * margin;
  const title = from.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  doc.font('Helvetica-Bold').fontSize(16).text(settings?.centre_name || 'Wellness Centre', x, margin, { width: w });
  doc.font('Helvetica').fontSize(11).text(`Patient records, ${title} · ${stays.length} ${stays.length === 1 ? 'stay' : 'stays'}`, { width: w });
  doc.moveDown(0.8);
  if (!stays.length) doc.text('Nobody stayed this month.', { width: w });

  for (const s of stays) {
    const p = s.Patient;
    const mine = appts.filter((a) => a.patient_id === p.id && a.scheduled_date >= s.start_date && a.scheduled_date <= s.end_date);
    const given = mine.filter((a) => !['cancelled', 'no_show'].includes(a.status));
    const counts = new Map<string, number>();
    for (const a of given.filter((a) => !a.Therapy.is_consultation)) counts.set(a.Therapy.name, (counts.get(a.Therapy.name) ?? 0) + 1);
    const visits = given.filter((a) => a.Therapy.is_consultation);
    const doctors = [...new Set(visits.map((a) => a.Staff?.name).filter(Boolean))];
    const missed = mine.length - given.length;
    const no = (s.discharge as { no?: string } | null)?.no;
    const lines = [
      `Stay ${nice(s.start_date)} to ${nice(s.end_date)}${s.on_site === false ? ' · day patient' : ''}${p.country ? ` · ${p.country}` : ''}`,
      no ? `Discharge summary No. ${no}` : 'No discharge summary',
      counts.size ? `Treatments: ${[...counts].map(([n, c]) => `${n} ×${c}`).join(', ')}` : 'No treatments given this month',
      visits.length ? `Consultations: ${visits.length}${doctors.length ? ` (${doctors.join(', ')})` : ''}` : '',
      missed ? `Cancelled or missed: ${missed}` : '',
    ].filter(Boolean);
    doc.font('Helvetica').fontSize(10);
    const need = 18 + lines.reduce((h, l) => h + doc.heightOfString(l, { width: w - 12 }), 0);
    if (doc.y + need > doc.page.height - margin - 16) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).text(`${p.name}${p.registration_number ? ` · Reg. ${p.registration_number}` : ''}`, x, doc.y, { width: w });
    doc.font('Helvetica').fontSize(10);
    for (const l of lines) doc.text(l, x + 12, doc.y, { width: w - 12 });
    doc.moveDown(0.6);
  }

  const made = madeWith(settings);
  if (made) doc.font('Helvetica').fontSize(8).fillColor('#666').text(made, x, doc.page.height - margin - 10, { width: w, align: 'right', lineBreak: false });
  doc.end();
  return await done;
}
