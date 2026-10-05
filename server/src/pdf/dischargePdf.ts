import PDFDocument from 'pdfkit';
import { madeWith } from '../product.js';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { dischargeOf, letterheadOf, type DischargeView, type Letterhead, type Med } from '../discharge.js';

/**
 * The discharge summary on A4, at most two pages: letterhead, the facts grid,
 * the doctor's sections, the stay day by day, medicines and both signatures.
 * Laid out after the report a real centre hands its residents (#194).
 */
const DEVANAGARI = fileURLToPath(new URL('../../assets/NotoSansDevanagari-Regular.ttf', import.meta.url));
const M = 36;
const W = 595.28 - 2 * M;
const BOTTOM = 841.89 - M - 18;
const LINE = '#999';

const nice = (ymd: string) => (ymd ? new Date(`${ymd.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const image = (doc: any, uri: string | null | undefined, x: number, y: number, opts: object) => {
  if (!uri?.startsWith('data:image/png') && !uri?.startsWith('data:image/jp')) return false;
  try { doc.image(Buffer.from(uri.split(',')[1], 'base64'), x, y, opts); return true; } catch { return false; }
};

export async function generateDischargePdf(v: DischargeView, centre: { name: string; address: string | null; logo: string | null; made?: string }, lh: Letterhead): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true });
  doc.registerFont('Local', DEVANAGARI);
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const d = v.draft;
  const room = (h: number) => { if (doc.y + h > BOTTOM) doc.addPage(); };

  // Letterhead
  image(doc, centre.logo, M, M, { fit: [58, 58] });
  image(doc, lh.seal_logo, M + W - 58, M, { fit: [58, 58] });
  const tw = W - 140;
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#1d4d33').text(centre.name, M + 70, M, { width: tw, align: 'center' });
  if (lh.name_local) doc.font('Local').fontSize(12).text(lh.name_local, { width: tw, align: 'center' });
  doc.font('Helvetica').fontSize(7.5).fillColor('#333');
  for (const t of [lh.registration_line, lh.accreditation_line, centre.address, [lh.phones && `Phone: ${lh.phones}`, lh.email, lh.website].filter(Boolean).join('  ·  ')]) {
    if (t) doc.text(t, { width: tw, align: 'center' });
  }
  doc.y = Math.max(doc.y, M + 60) + 6;
  doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(1).strokeColor('#1d4d33').stroke();
  doc.moveDown(0.5).font('Helvetica-Bold').fontSize(13).fillColor('#000').text('Discharge Summary', M, doc.y, { width: W, align: 'center' });
  doc.moveDown(0.4);

  // The facts grid: three label/value pairs a row.
  const cell = W / 3;
  const grid = (rows: [string, string][][]) => {
    for (const row of rows) {
      const y = doc.y;
      row.forEach(([k, val], i) => {
        const x = M + i * cell;
        doc.rect(x, y, cell, 17).lineWidth(0.5).strokeColor(LINE).stroke();
        doc.font('Helvetica').fontSize(7).fillColor('#555').text(k, x + 3, y + 5, { width: 62, height: 10, ellipsis: true, lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text(val || '', x + 66, y + 4.5, { width: cell - 69, height: 10, ellipsis: true, lineBreak: false });
      });
      doc.x = M; doc.y = y + 17;
    }
  };
  const when = (ymd: string, t: string) => `${nice(ymd)}${t ? `, ${t}` : ''}`;
  grid([
    [['Discharge no.', d.no], ['Registration no.', d.registration_no], ['Duration', `${v.days} days`]],
    [['Name', v.name], ['Age / gender', `${v.age ?? '—'} / ${v.gender}`], ['Admitted', when(v.from, d.admitted_time)]],
    [['Mobile', v.phone || ''], ['Email', v.email || ''], ['Discharged', when(v.to, d.discharged_time)]],
    [['Address', d.address], ['Country', d.country], ['Passport no.', d.passport]],
    ...(d.payment_amount ? [[['Total payment', d.payment_amount], ['Mode', d.payment_mode], ['Date of payment', d.payment_date]] as [string, string][]] : []),
    [['Weight', d.weight], ['Blood pressure', d.bp], ['Bowel', d.bowel]],
    [['Appetite', d.appetite], ['Sleep', d.sleep], ['Menstrual cycle', d.menstrual]],
    [['Doshic dominance', d.dosha], ['Type of discharge', d.discharge_type], ['Doctor', v.doctor?.name || '']],
  ]);
  doc.moveDown(0.6);

  const section = (title: string, body: string, writeIn = false) => {
    if (!body && !writeIn) return;
    doc.font('Helvetica').fontSize(8.5);
    room(14 + (body ? doc.heightOfString(body, { width: W }) : 24));
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1d4d33').text(title.toUpperCase(), M, doc.y, { width: W });
    if (body) doc.font('Helvetica').fontSize(8.5).fillColor('#000').text(body, { width: W });
    else {
      // Left empty on purpose: two ruled lines to write on by hand, never a silent gap.
      for (let i = 0; i < 2; i++) { const y = doc.y + 12; doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.4).strokeColor(LINE).stroke(); doc.y = y; }
    }
    doc.moveDown(0.5);
  };
  section('Condition at discharge', d.condition, true);
  section('Final diagnosis', d.diagnosis, true);
  section('Reason for admission', d.reason);

  // The stay day by day. A row never splits across a page.
  const cols = [58, 32, 12, W - 58 - 32 - 12 - 58, 58];
  const xs = cols.map((_, i) => M + cols.slice(0, i).reduce((a, b) => a + b, 0));
  const head = () => {
    const y = doc.y;
    doc.rect(M, y, W, 13).fill('#e8f0eb');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000');
    ['Date', 'Day', '', 'Treatments', 'BP'].forEach((t, i) => doc.text(t, xs[i] + 3, y + 3.5, { width: cols[i] - 6, lineBreak: false }));
    doc.y = y + 13;
  };
  room(40);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1d4d33').text('TREATMENT DAY BY DAY', M, doc.y);
  doc.moveDown(0.2);
  head();
  for (const r of v.table) {
    const text = r.items.map((i) => i.name).join(', ') || 'Rest';
    doc.font('Helvetica').fontSize(7.5);
    const h = Math.max(11, doc.heightOfString(text, { width: cols[3] - 6 }) + 3);
    if (doc.y + h > BOTTOM) { doc.addPage(); head(); }
    const y = doc.y;
    doc.moveTo(M, y + h).lineTo(M + W, y + h).lineWidth(0.3).strokeColor(LINE).stroke();
    doc.fillColor('#000').text(nice(r.date), xs[0] + 3, y + 2, { width: cols[0] - 6, lineBreak: false });
    doc.text(String(r.day), xs[1] + 3, y + 2, { width: cols[1] - 6, lineBreak: false });
    if (r.items.some((i) => i.consultation)) {
      const cx = xs[2] + 6, cy = y + 5.5;
      doc.polygon([cx, cy - 3.5], [cx + 3.5, cy], [cx, cy + 3.5], [cx - 3.5, cy]).fill('#1d4d33').fillColor('#000');
    }
    doc.text(text, xs[3] + 3, y + 2, { width: cols[3] - 6 });
    doc.text(r.bp, xs[4] + 3, y + 2, { width: cols[4] - 6, lineBreak: false });
    doc.x = M; doc.y = y + h;
  }
  const ly = doc.y + 6;
  doc.polygon([M + 3, ly - 3], [M + 6, ly], [M + 3, ly + 3], [M, ly]).fill('#1d4d33');
  doc.font('Helvetica').fontSize(7).fillColor('#555').text("a day with a doctor's consultation", M + 10, ly - 3);
  doc.fillColor('#000');
  doc.moveDown(0.6);

  section('Investigations', d.investigations);
  const meds = (title: string, list: Med[]) => {
    if (!list.length) return;
    const lines = list.map((m, i) => `${i + 1}. ${m.name}${m.dose ? `  ${m.dose}` : ''}${m.timing ? `, ${m.timing}` : ''}${m.from ? `, from ${nice(m.from)}` : ''}${m.days ? `, ${m.days} days` : ''}`);
    section(title, lines.join('\n'));
  };
  meds('Medication during stay', d.meds_stay);
  meds(`Advised medicines at discharge${d.meds_home_for ? `, for ${d.meds_home_for}` : ''}`, d.meds_home);
  section('Special instructions', d.instructions);
  section('Follow-up', d.follow_up, true);
  section('When to obtain urgent care', d.urgent_when);
  section('How to obtain urgent care', d.urgent_how);

  // Signatures side by side.
  room(92);
  const y = doc.y + 10;
  const [date, time] = d.signed_at.split(' ');
  const signed = `Date: ${nice(date)}${time ? `   Time: ${time}` : ''}`;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text('Signature of the patient', M, y + 48);
  doc.font('Helvetica').fontSize(8).text(signed, M, y + 60);
  const rx = M + W - 200;
  image(doc, v.doctor?.signature, rx, y, { fit: [140, 44] });
  doc.font('Helvetica-Bold').fontSize(9).text(v.doctor?.name || 'Doctor', rx, y + 48, { width: 200 });
  const creds = [v.doctor?.qualification, v.doctor?.reg_no && `Reg. no. ${v.doctor.reg_no}`].filter(Boolean).join(', ');
  doc.font('Helvetica').fontSize(8);
  if (creds) doc.text(creds, rx, doc.y, { width: 200 });
  doc.text(signed, rx, doc.y, { width: 200 });

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // or writing in the margin starts a new page
    doc.font('Helvetica').fontSize(7).fillColor('#666');
    const foot = [lh.footer_line, `${v.name} · ${d.no} · page ${i + 1} of ${range.count}`, centre.made].filter(Boolean).join('    ');
    doc.text(foot, M, 841.89 - M - 8, { width: W, align: 'center', lineBreak: false });
  }
  doc.end();
  return done;
}

/** The PDF for one stay, with the centre's letterhead; null when there is no such stay. */
export async function renderDischarge(stayId: string, prisma: PrismaClient) {
  const v = await dischargeOf(stayId, prisma);
  if (!v) return null;
  const s = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const pdf = await generateDischargePdf(v, { name: s?.centre_name || 'Wellness Centre', address: s?.address ?? null, logo: s?.logo ?? null, made: madeWith(s) }, letterheadOf(s?.letterhead));
  return { pdf, filename: `${v.name} - discharge summary.pdf` };
}
