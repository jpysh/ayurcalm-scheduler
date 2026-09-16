declare module 'pdfkit';
import PDFDocument from 'pdfkit';
import { PrismaClient } from '@prisma/client';
import { addHeader, shortenWords, toMinutes, durationBetween } from './dailySchedulePdf.js';

const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** A line inside a time cell. Treatment is bold; an event or an absence is not. */
export type RotaLine = { t: string; text: string; bold: boolean; grey?: boolean };
export type RotaRow = { name: string; note: string; cells: RotaLine[][]; available: boolean };
export type Rota = { slots: { label: string; start: number; end: number }[]; rows: RotaRow[] };

type TimeOffRow = {
  entity_type: string; entity_id: string | null;
  date: Date | null; start_date: Date | null; end_date: Date | null;
  start_time: string | null; end_time: string | null;
  recurrence: string | null; weekdays: string[]; description: string | null;
};

/**
 * The absences that land on this day for this therapist. Read the same way the
 * scheduler reads them (`server/src/scheduler.ts`): a single date, a date range,
 * or a weekly recurrence on a matching weekday.
 */
const timeOffToday = (rows: TimeOffRow[], staffId: string, day: Date, weekday: string) =>
  rows.filter((h) => {
    if (h.entity_type !== 'staff' || h.entity_id !== staffId) return false;
    const dateHit = h.date != null && h.date.toDateString() === day.toDateString();
    const rangeHit = h.start_date != null && h.end_date != null && h.start_date <= day && h.end_date >= day;
    const weeklyHit = h.recurrence === 'weekly' && Array.isArray(h.weekdays) && h.weekdays.includes(weekday);
    return dateHit || rangeHit || weeklyHit;
  });

/** An absence with no hours on it takes the whole day; one with hours takes only those. */
const isFullDay = (h: TimeOffRow) => h.start_time == null || h.end_time == null;

const eventAppliesToStaff = (e: { staff_id: string | null; staff_scope: string | null; staff_ids: string[] }, staffId: string) => {
  const scope = e.staff_scope || (e.staff_id ? 'custom' : 'none');
  if (scope === 'all') return true;
  if (scope === 'none') return false;
  return e.staff_id === staffId || (Array.isArray(e.staff_ids) && e.staff_ids.includes(staffId));
};

/**
 * Everything the rota prints, worked out before any drawing happens, so the
 * grouping and the cell text can be tested without reading a PDF.
 *
 * Rows are therapists in two groups, each alphabetical: those working today,
 * then those out for the whole day. A part-day absence keeps a therapist in the
 * working group with those hours greyed — they are still on shift.
 */
export const buildRota = (input: {
  day: Date;
  staff: { id: string; name: string; is_active: boolean }[];
  appts: { staff_id: string | null; patient_id: string; therapy_id: string; room_id: string | null; start_time: string; duration_minutes: number }[];
  events: { start_time: string; end_time: string; activity_name: string; staff_id: string | null; staff_scope: string | null; staff_ids: string[] }[];
  timeOff: TimeOffRow[];
  patientById: Record<string, string>;
  therapyById: Record<string, string>;
  roomById: Record<string, string>;
  hourMinW: number;
  bandWidth: number;
  onlyStaffId?: string;
}): Rota => {
  const { day, appts, events, timeOff, patientById, therapyById, roomById } = input;
  const weekday = weekdayNames[day.getDay()];

  const staff = input.staff
    .filter((s) => s.is_active && (!input.onlyStaffId || s.id === input.onlyStaffId))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Bands come from what is actually scheduled, so a centre working 09:00-16:30
  // prints no column for 20:00. Widened past the hour when an hour would be too
  // narrow to read a treatment in, the same way the centre sheet does.
  const offsByStaff = new Map(staff.map((s) => [s.id, timeOffToday(timeOff, s.id, day, weekday)] as const));
  // A therapist out for the whole day prints no entries, so nothing of theirs
  // should open a column either: their 07:30 class was giving the sheet an empty
  // 07:00 band.
  const onShift = staff.filter((s) => !(offsByStaff.get(s.id) || []).some(isFullDay));
  const eventsOnStaff = events.filter((e) => onShift.some((s) => eventAppliesToStaff(e, s.id)));
  // Part-day leave makes a band of its own even when nothing is booked in it:
  // an afternoon with no treatments is exactly the afternoon the rota has to
  // show as unavailable.
  const offTimes = onShift.flatMap((s) => offsByStaff.get(s.id) || []).filter((h) => !isFullDay(h)).map((h) => h.start_time as string);
  const apptTimes = appts.filter((a) => onShift.some((s) => s.id === a.staff_id)).map((a) => a.start_time);
  const startTimes = [...apptTimes, ...eventsOnStaff.map((e) => e.start_time), ...offTimes];
  const bucketsFor = (size: number) => new Set(startTimes.map((t) => Math.floor(toMinutes(t) / size) * size));
  const share = (size: number) => input.bandWidth / Math.max(1, bucketsFor(size).size);
  const bucket = [60, 120, 180, 240].find((size) => share(size) >= input.hourMinW) ?? 240;
  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const slots = [...bucketsFor(bucket)]
    .map((start) => ({ label: bucket > 60 ? `${hhmm(start)}–${hhmm(start + bucket)}` : hhmm(start), start, end: start + bucket }))
    .sort((a, b) => a.start - b.start);

  const working: RotaRow[] = [];
  const out: RotaRow[] = [];
  for (const s of staff) {
    const offs = offsByStaff.get(s.id) || [];
    const fullDay = offs.find(isFullDay);
    const reason = (fullDay || offs[0])?.description || '';
    if (fullDay) {
      out.push({ name: s.name, note: reason || 'Not available', cells: slots.map(() => []), available: false });
      continue;
    }
    const mine = appts.filter((a) => a.staff_id === s.id);
    const myEvents = events.filter((e) => eventAppliesToStaff(e, s.id));
    const cells = slots.map((slot) => {
      const inSlot = (t: string) => toMinutes(t) >= slot.start && toMinutes(t) < slot.end;
      const lines: RotaLine[] = [
        ...mine.filter((a) => inSlot(a.start_time)).map((a) => ({
          t: a.start_time,
          bold: true,
          text: [
            `${therapyById[a.therapy_id] || a.therapy_id} ${a.duration_minutes || 0}m`,
            patientById[a.patient_id] || a.patient_id,
            a.room_id ? roomById[a.room_id] || a.room_id : '',
          ].filter(Boolean).join(' · '),
        })),
        // An event the therapist is running is time they are not free, so it
        // belongs on the rota beside the treatments, not hidden behind them.
        ...myEvents.filter((e) => inSlot(e.start_time)).map((e) => ({
          t: e.start_time,
          bold: false,
          text: `${e.activity_name} ${durationBetween(e.start_time, e.end_time)}m`,
        })),
        // Part-day leave is greyed in the hours it covers rather than moving the
        // whole row: the therapist is in for the rest of the day.
        ...offs.filter((h) => !isFullDay(h) && toMinutes(h.start_time as string) < slot.end && toMinutes(h.end_time as string) > slot.start)
          .map((h) => ({
            t: h.start_time as string,
            bold: false,
            grey: true,
            // The reason is spelled out in the first band the absence covers and
            // shortened in the rest: three bands each repeating the same sentence
            // is three bands of noise.
            text: toMinutes(h.start_time as string) >= slot.start
              ? `Off — ${h.description || 'time off'} (to ${h.end_time})`
              : 'Off',
          })),
      ];
      return lines.sort((m, n) => m.t.localeCompare(n.t));
    });
    working.push({ name: s.name, note: '', cells, available: true });
  }

  return { slots, rows: [...working, ...out] };
};

/**
 * The same day as the centre sheet, turned on its side: therapists down the
 * page, time across. The centre sheet is read by a resident looking for their
 * own row; this one is read by the team and whoever is running the day.
 */
export async function generateTherapistRotaPdf(dateISO: string, prisma: PrismaClient, staffId?: string): Promise<Buffer> {
  const margin = 36;
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: margin, bottom: margin, left: margin, right: margin } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: any) => chunks.push(Buffer.from(c)));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const day = new Date(dateISO);
  const weekday = weekdayNames[day.getDay()];

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const centreName = settings?.centre_name || process.env.CENTRE_NAME || 'Wellness Centre';

  const [rooms, patients, therapies, staff, appts, eventsByDate, weeklyEvents, timeOff] = await Promise.all([
    prisma.therapyRoom.findMany(),
    prisma.patient.findMany(),
    prisma.therapy.findMany(),
    prisma.staff.findMany(),
    prisma.appointment.findMany({ where: { scheduled_date: day } }),
    prisma.programEvent.findMany({ where: { OR: [{ date: day }, { AND: [{ start_date: { lte: day } }, { end_date: { gte: day } }] }] } }),
    prisma.programEvent.findMany({ where: { recurrence: 'weekly' } }),
    prisma.timeOff.findMany({ where: { entity_type: 'staff' } }),
  ]);

  const events = [...eventsByDate, ...weeklyEvents.filter((e) => Array.isArray(e.weekdays) && e.weekdays.includes(weekday))];

  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  doc.font('Helvetica').fontSize(9);
  const NAME_W = Math.min(120, Math.max(70, ...staff.map((s) => doc.widthOfString(`${s.name} `) + 10)));

  const rota = buildRota({
    day,
    staff,
    appts,
    events,
    timeOff,
    patientById: Object.fromEntries(patients.map((p) => [p.id, p.name])),
    therapyById: Object.fromEntries(therapies.map((t) => [t.id, t.name])),
    roomById: Object.fromEntries(rooms.map((r) => [r.id, r.name])),
    hourMinW: 110,
    bandWidth: w - NAME_W,
    onlyStaffId: staffId,
  });

  addHeader(doc, dateISO, `${centreName} — Therapist rota`);
  const startY = doc.y + 2;

  if (rota.rows.length === 0) {
    doc.fontSize(12).text('No therapists on record for this date.', x, startY + 8);
    doc.end();
    return await done;
  }

  const headers = ['Therapist', ...rota.slots.map((s) => s.label)];
  const colWidths = headers.map((_, k) => (k === 0 ? NAME_W : (w - NAME_W) / Math.max(1, rota.slots.length)));
  const colX = headers.map((_, k) => x + colWidths.slice(0, k).reduce((a, b) => a + b, 0));

  const lineText = (l: RotaLine) => `${l.t} ${l.text}`;

  // Rows in a group print under a heading that says what the group is, so the
  // sheet answers 'who is in today' before it answers 'doing what'. A single
  // therapist asked for by name gets neither heading: it is their own day.
  type Heading = { kind: 'heading'; title: string };
  type Row = { kind: 'row' } & RotaRow;
  const items: (Row | Heading)[] = [];
  if (staffId) {
    for (const r of rota.rows) items.push({ kind: 'row', ...r });
  } else {
    for (const available of [true, false]) {
      const group = rota.rows.filter((r) => r.available === available);
      if (group.length === 0) continue;
      items.push({ kind: 'heading', title: `${available ? 'Working today' : 'Not available today'} — ${group.length}` });
      for (const r of group) items.push({ kind: 'row', ...r });
    }
  }

  // Type is shrunk rather than words broken: a column narrower than its longest
  // word gives 'Chatt / erjee', which on a printed rota reads as a fault.
  let cellFont = 9;
  let headFont = 11;
  const applyCellFont = () => doc.font('Helvetica').fontSize(cellFont);
  const applyHeadFont = () => doc.font('Helvetica-Bold').fontSize(headFont);
  const fitsWord = (word: string, colW: number) => doc.widthOfString(`${word} `) <= colW - 10;
  const rowItems = items.filter((it): it is Row => it.kind === 'row');
  for (const size of [9, 8.5, 8]) {
    cellFont = size;
    headFont = Math.min(11, size + 2);
    applyCellFont();
    const fits = rowItems.every((r) =>
      r.name.split(/\s+/).every((word) => fitsWord(word, colWidths[0]))
      && r.cells.every((cell, c) => cell.every((l) => lineText(l).split(/\s+/).every((word) => fitsWord(word, colWidths[c + 1])))));
    if (fits) break;
  }
  const widthOfWord = (str: string) => doc.widthOfString(`${str} `);
  for (const r of rowItems) {
    r.name = shortenWords(r.name, colWidths[0] - 10, widthOfWord);
    r.cells.forEach((cell, c) => cell.forEach((l) => {
      l.text = shortenWords(lineText(l), colWidths[c + 1] - 10, widthOfWord).slice(l.t.length + 1);
    }));
  }

  const headerH = 18;
  const FOOTER_H = 14;
  const pageBottom = doc.page.height - doc.page.margins.bottom - FOOTER_H;

  const lineHeight = (l: RotaLine, colW: number) => {
    doc.font(l.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(cellFont);
    return doc.heightOfString(lineText(l), { width: colW - 8 });
  };
  const itemHeight = (it: Row | Heading) => {
    if (it.kind === 'heading') {
      applyHeadFont();
      doc.fontSize(cellFont + 1);
      return doc.heightOfString(it.title, { width: w - 8 }) + 8;
    }
    doc.font('Helvetica-Bold').fontSize(cellFont);
    const nameH = doc.heightOfString(`${it.name}${it.note ? `\n${it.note}` : ''}`, { width: colWidths[0] - 8 }) + 6;
    return Math.max(18, nameH, ...it.cells.map((cell, c) => cell.reduce((sum, l) => sum + lineHeight(l, colWidths[c + 1]), 0) + 6));
  };
  const heights = items.map(itemHeight);

  // Page breaks are chosen before anything is drawn: PDFKit cannot unpaint a
  // row, and text past the bottom margin moves to the next page while the box
  // it belongs in stays here.
  const pageStarts = new Set<number>([0]);
  {
    let used = 0;
    const available = pageBottom - startY - headerH;
    for (let r = 0; r < items.length; r++) {
      if (r > 0 && used + heights[r] > available) {
        const start = items[r - 1].kind === 'heading' && r - 1 > 0 ? r - 1 : r;
        pageStarts.add(start);
        used = 0;
        for (let back = start; back <= r; back++) used += heights[back];
      } else {
        used += heights[r];
      }
    }
  }
  const totalPages = pageStarts.size;

  let pageNo = 0;
  let yy = startY;
  const drawHeaderRow = () => {
    applyHeadFont();
    headers.forEach((h, k) => {
      doc.rect(colX[k], yy, colWidths[k], headerH).stroke();
      const th = doc.heightOfString(h, { width: colWidths[k] - 8 });
      doc.text(h, colX[k] + 4, yy + Math.max(5, (headerH - th) / 2), { width: colWidths[k] - 8, align: 'center' });
    });
    yy += headerH;
  };
  const startPage = (first: boolean) => {
    if (!first) {
      doc.addPage();
      addHeader(doc, dateISO, `${centreName} — Therapist rota`);
      yy = doc.y + 2;
    }
    pageNo++;
    doc.font('Helvetica').fontSize(8)
      .text(`Page ${pageNo} of ${totalPages}`, x, pageBottom + 4, { width: w, align: 'center', lineBreak: false });
    drawHeaderRow();
  };

  startPage(true);
  for (let r = 0; r < items.length; r++) {
    const it = items[r];
    if (r > 0 && pageStarts.has(r)) startPage(false);
    if (it.kind === 'heading') {
      const h = heights[r];
      doc.save();
      doc.rect(x, yy, w, h).fillOpacity(0.07).fill('#000');
      doc.restore();
      doc.rect(x, yy, w, h).stroke();
      doc.font('Helvetica-Bold').fontSize(cellFont + 1).text(it.title, x + 4, yy + 3, { width: w - 8 });
      yy += h;
      continue;
    }
    const rowH = heights[r];
    doc.rect(colX[0], yy, colWidths[0], rowH).stroke();
    doc.font('Helvetica-Bold').fontSize(cellFont).text(it.name, colX[0] + 4, yy + 3, { width: colWidths[0] - 8 });
    // Why someone is out is the useful half of an empty row, so it prints under
    // the name rather than being left to the admin to remember.
    if (it.note) doc.font('Helvetica').fontSize(cellFont).fillColor('#555').text(it.note, colX[0] + 4, doc.y, { width: colWidths[0] - 8 }).fillColor('#000');
    it.cells.forEach((cell, c) => {
      const k = c + 1;
      // A row that is out for the day is shaded across the whole width: a rota
      // is read at a glance and absence has to be visible from a step back.
      if (!it.available) {
        doc.save();
        doc.rect(colX[k], yy, colWidths[k], rowH).fillOpacity(0.12).fill('#000');
        doc.restore();
      }
      doc.rect(colX[k], yy, colWidths[k], rowH).stroke();
      let ty = yy + 3;
      for (const l of cell) {
        if (l.grey) {
          doc.save();
          doc.rect(colX[k] + 1, ty - 2, colWidths[k] - 2, lineHeight(l, colWidths[k]) + 2).fillOpacity(0.12).fill('#000');
          doc.restore();
        }
        doc.font(l.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(cellFont);
        if (l.grey) doc.fillColor('#555');
        doc.text(lineText(l), colX[k] + 4, ty, { width: colWidths[k] - 8 });
        doc.fillColor('#000');
        ty += doc.heightOfString(lineText(l), { width: colWidths[k] - 8 });
      }
    });
    yy += rowH;
  }

  doc.end();
  return await done;
}
