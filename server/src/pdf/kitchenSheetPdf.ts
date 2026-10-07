import PDFDocument from 'pdfkit';
import { PrismaClient } from '@prisma/client';
import { madeWith } from '../product.js';
import { kitchenMeals, loadDietsForDay, mealLabel } from '../dietResolution.js';
import { addHeader } from './dailySchedulePdf.js';

/**
 * The kitchen's page for one day (#414): one A4, per meal how many of each plan
 * to cook, then who eats something of their own. The cook reads counts; the day
 * sheet's paragraphs per plan are for patients.
 */
export async function generateKitchenSheetPdf(dateISO: string, prisma: PrismaClient): Promise<Buffer> {
  const margin = 36;
  const doc = new PDFDocument({ size: 'A4', margins: { top: margin, bottom: margin, left: margin, right: margin } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: any) => chunks.push(Buffer.from(c)));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const day = new Date(dateISO);
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const centreName = settings?.centre_name || process.env.CENTRE_NAME || 'Wellness Centre';
  const [stays, diets, treated, events] = await Promise.all([
    prisma.patientStay.findMany({ where: { start_date: { lte: day }, end_date: { gte: day } }, include: { Patient: true } }),
    loadDietsForDay(day, prisma),
    prisma.appointment.findMany({ where: { scheduled_date: day, status: { notIn: ['cancelled', 'no_show'] } }, select: { patient_id: true } }),
    prisma.programEvent.findMany({ where: { patients_scope: { not: 'custom' } } }),
  ]);
  // Only the patients staying eat the centre's meals; an outpatient goes home.
  const withTreatment = new Set(treated.map((a) => a.patient_id));
  const people = [...new Map(stays.map((s) => [s.patient_id, s.Patient])).values()]
    .map((p) => ({ name: p.name, diet: diets.dietFor(p, withTreatment.has(p.id)) }));
  const meals = kitchenMeals(people);
  // A meal prints with the window it is served in, when the centre has one by that name.
  const windowOf = (label: string) => {
    const e = events.find((x) => x.activity_name.toLowerCase() === label.toLowerCase());
    return e ? ` ${e.start_time}–${e.end_time}` : '';
  };

  addHeader(doc, dateISO, centreName);
  const x = doc.page.margins.left;
  const w = doc.page.width - x - doc.page.margins.right;
  doc.font('Helvetica-Bold').fontSize(12).text(`Kitchen — ${people.length} staying`, x, doc.y, { width: w, align: 'center' });
  doc.moveDown(0.6);
  if (!people.length) doc.font('Helvetica').fontSize(11).text('Nobody is staying this day.', x);

  const COUNT_W = 34;
  for (const m of people.length ? meals : []) {
    if (!m.counts.length && !m.exceptions.length) continue;
    doc.font('Helvetica-Bold').fontSize(12).text(`${mealLabel[m.meal]}${windowOf(mealLabel[m.meal])} — ${m.total}`, x, doc.y + 4, { width: w });
    doc.moveTo(x, doc.y + 1).lineTo(x + w, doc.y + 1).stroke();
    doc.moveDown(0.3);
    for (const c of m.counts) {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(11).text(String(c.n), x, y, { width: COUNT_W - 6, align: 'right' });
      doc.text(c.plan, x + COUNT_W, y, { width: w - COUNT_W, continued: true })
        .font('Helvetica').text(`  ${c.food || "the centre's usual food"}`);
      doc.moveDown(0.15);
    }
    if (m.exceptions.length) {
      doc.font('Helvetica-Bold').fontSize(10).text('Their own:', x + COUNT_W, doc.y + 2, { width: w - COUNT_W });
      for (const e of m.exceptions) {
        doc.font('Helvetica-Bold').fontSize(10).text(e.name, x + COUNT_W, doc.y, { width: w - COUNT_W, continued: true })
          .font('Helvetica').text(`  ${e.food || 'nothing'} (${e.plan})`);
      }
    }
    doc.moveDown(0.6);
  }

  const made = madeWith(settings);
  if (made) doc.font('Helvetica').fontSize(8).fillColor('#666')
    .text(made, x, doc.page.height - doc.page.margins.bottom - 10, { width: w, align: 'right', lineBreak: false });
  doc.end();
  return await done;
}
