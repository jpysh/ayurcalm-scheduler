import PDFDocument from 'pdfkit';
import { PrismaClient } from '@prisma/client';
import { madeWith } from '../product.js';
import { guestRoomsFor } from '../guestRooms.js';
import { addHeader } from './dailySchedulePdf.js';

type Guest = { name: string; start_date: string; end_date: string };
type SheetRoom = { name: string; beds: number; type: string; guests: Guest[]; /** Out of use for this day (#563). */ out?: { reason: string | null } | null };
export type RoomRow = { room: string; kind: 'turnover' | 'leaving' | 'arriving' | 'staying' | 'free' | 'out'; line: string };

const dayText = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
const list = (names: string[]) => names.join(', ');

/**
 * What the housekeeper reads for one day, per room (#559): the room to make up first when someone
 * arrives into it, then the rooms to make up, the rooms to have ready, who is staying on, and what
 * is free. Pure, so `npm run test:rooms-sheet` can say what is printed without making a PDF.
 * Rooms arrive in the server's order (type, then name), which is the order they are walked in.
 */
export function buildGuestRoomsSheet(rooms: SheetRoom[], day: string) {
  const groups: { type: string; rows: RoomRow[] }[] = [];
  for (const r of rooms) {
    const sleeping = r.guests.filter((g) => g.start_date <= day && day < g.end_date);
    const arriving = sleeping.filter((g) => g.start_date === day);
    const staying = sleeping.filter((g) => g.start_date !== day);
    const leaving = r.guests.filter((g) => g.end_date === day && g.start_date < day);
    let row: RoomRow;
    const outText = r.out ? `Out of use${r.out.reason ? `: ${r.out.reason}` : ''}` : '';
    // A shared room where one guest leaves and another stays is not empty to make up.
    const emptied = !staying.length;
    if (emptied && leaving.length && arriving.length) row = { room: r.name, kind: 'turnover', line: `Make up, then ready for ${list(arriving.map((g) => g.name))} (arrives today) · until ${dayText(arriving[0].end_date)}` };
    else if (emptied && leaving.length) row = { room: r.name, kind: 'leaving', line: `Make up · ${list(leaving.map((g) => g.name))} leaves today` };
    else if (emptied && r.out) row = { room: r.name, kind: 'out', line: outText };
    else if (emptied && arriving.length) row = { room: r.name, kind: 'arriving', line: `Ready for ${list(arriving.map((g) => g.name))} · until ${dayText(arriving[0].end_date)}` };
    else if (!emptied) {
      const spare = r.beds - staying.length;
      row = { room: r.name, kind: 'staying', line: `${list(staying.map((g) => g.name))} · until ${dayText(staying.map((g) => g.end_date).sort()[0])}${leaving.length ? ` · ${list(leaving.map((g) => g.name))} leaves today` : ''}${spare > 0 && r.beds > 1 && !r.out ? ` · ${spare} bed free` : ''}` };
    } else row = { room: r.name, kind: 'free', line: 'Free' };
    // A guest still in a room taken out of use must move: the sheet says so as the inbox does (#624).
    if (r.out && row.kind !== 'out') row.line += ` · out of use${r.out.reason ? `: ${r.out.reason}` : ''}${row.kind === 'staying' ? ', needs another room' : ''}`;
    const last = groups[groups.length - 1];
    if (last && last.type === r.type) last.rows.push(row); else groups.push({ type: r.type, rows: [row] });
  }
  const all = groups.flatMap((g) => g.rows);
  const n = (k: RoomRow['kind'][]) => all.filter((r) => k.includes(r.kind)).length;
  return {
    groups,
    counts: { rooms: all.length, makeUp: n(['turnover', 'leaving']), arriving: n(['turnover', 'arriving']), staying: n(['staying']), free: n(['free']), out: n(['out']) },
    first: all.filter((r) => r.kind === 'turnover').map((r) => r.room),
  };
}

/** The housekeeper's page for one day: one A4 for a few dozen rooms, more pages for more, never a row cut in half. */
export async function generateGuestRoomsSheetPdf(dateISO: string, prisma: PrismaClient): Promise<Buffer> {
  const margin = 36;
  const doc = new PDFDocument({ size: 'A4', margins: { top: margin, bottom: margin, left: margin, right: margin } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: any) => chunks.push(Buffer.from(c)));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const day = new Date(`${dateISO}T00:00:00Z`);
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const centreName = settings?.centre_name || process.env.CENTRE_NAME || 'Wellness Centre';
  const rooms = await guestRoomsFor(prisma, day, new Date(day.getTime() + 86400000));
  const sheet = buildGuestRoomsSheet(rooms, dateISO);

  addHeader(doc, dateISO, centreName);
  const x = doc.page.margins.left;
  const w = doc.page.width - x - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom - 16;
  doc.font('Helvetica-Bold').fontSize(12).text(`Guest rooms — ${sheet.counts.rooms}`, x, doc.y, { width: w, align: 'center' });
  doc.moveDown(0.4);
  if (!sheet.counts.rooms) {
    doc.font('Helvetica').fontSize(11).text('No guest rooms are set up.', x);
  } else {
    const c = sheet.counts;
    doc.font('Helvetica').fontSize(10.5).text(`To make up ${c.makeUp}  ·  Arriving ${c.arriving}  ·  Staying on ${c.staying}  ·  Free ${c.free}${c.out ? `  ·  Out of use ${c.out}` : ''}`, x, doc.y, { width: w, align: 'center' });
    if (sheet.first.length) doc.font('Helvetica-Bold').fontSize(10.5).text(`Make up first, someone arrives into: ${sheet.first.join(', ')}`, x, doc.y + 4, { width: w, align: 'center' });
    doc.moveDown(0.5);
  }

  const ROW = 17, ROOM_W = 64, BOX = 9;
  const head = (type: string, more: boolean) => {
    doc.font('Helvetica-Bold').fontSize(11.5).text(`${type}${more ? ' (continued)' : ''}`, x, doc.y + 4, { width: w });
    doc.moveTo(x, doc.y + 1).lineTo(x + w, doc.y + 1).stroke();
    doc.y += 5;
  };
  for (const g of sheet.groups) {
    if (doc.y + ROW * 3 > bottom) doc.addPage();
    head(g.type, false);
    for (const r of g.rows) {
      // PDFKit would carry text to a new page but leave the box behind: break before the row.
      if (doc.y + ROW > bottom) { doc.addPage(); head(g.type, true); }
      const y = doc.y;
      if (r.kind === 'turnover' || r.kind === 'leaving' || r.kind === 'arriving') doc.rect(x + 2, y + 2, BOX, BOX).lineWidth(0.8).stroke();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(r.room, x + 20, y, { width: ROOM_W, lineBreak: false, ellipsis: true });
      doc.font(r.kind === 'free' || r.kind === 'staying' || r.kind === 'out' ? 'Helvetica' : 'Helvetica-Bold').fontSize(10.5).fillColor(r.kind === 'free' || r.kind === 'out' ? '#666' : '#000')
        .text(r.line, x + 20 + ROOM_W, y + 0.5, { width: w - 20 - ROOM_W, height: ROW - 2, lineBreak: false, ellipsis: true });
      doc.fillColor('#000');
      doc.y = y + ROW;
    }
  }

  const made = madeWith(settings);
  if (made) doc.font('Helvetica').fontSize(8).fillColor('#666')
    .text(made, x, doc.page.height - doc.page.margins.bottom - 10, { width: w, align: 'right', lineBreak: false });
  doc.end();
  return await done;
}
