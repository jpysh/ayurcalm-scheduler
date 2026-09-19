declare module 'pdfkit';
import { teamOf } from '../availability.js';
import PDFDocument from 'pdfkit';
import { PrismaClient } from '@prisma/client';
import { addHeader, shortenWords, toMinutes, durationBetween } from './dailySchedulePdf.js';

const MIDDAY = 12 * 60;
const AFTERNOON_END = 16 * 60;

const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** A line inside a time cell. Treatment is bold; an event or an absence is not. */
export type RotaLine = { t: string; text: string; bold: boolean; grey?: boolean; noTime?: boolean };
/** `booked` is minutes on treatments (leading or assisting) and events that day. */
export type RotaRow = { name: string; note: string; cells: RotaLine[][]; available: boolean; booked: number };
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

/** 315 -> '5h 15m', 60 -> '1h', 45 -> '45m'. */
export const formatBooked = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
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
  appts: { staff_id: string | null; co_staff_ids?: string[]; patient_id: string; therapy_id: string; room_id: string | null; start_time: string; duration_minutes: number }[];
  events: { start_time: string; end_time: string; activity_name: string; staff_id: string | null; staff_scope: string | null; staff_ids: string[] }[];
  timeOff: TimeOffRow[];
  patientById: Record<string, string>;
  therapyById: Record<string, string>;
  roomById: Record<string, string>;
  openingTime: string;
  closingTime: string;
  onlyStaffId?: string;
}): Rota => {
  const { day, appts, events, timeOff, patientById, therapyById, roomById } = input;
  const staffName = new Map(input.staff.map((s) => [s.id, s.name] as const));
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
  const apptTimes = appts.filter((a) => onShift.some((s) => teamOf(a).includes(s.id))).map((a) => a.start_time);
  const startTimes = [...apptTimes, ...eventsOnStaff.map((e) => e.start_time), ...offTimes];
  // Three columns, always the same three, because the rota hangs on a staff
  // board and a reader who has to work out what today's columns mean has
  // already stopped reading. An hour a column was tried and cannot fit: twelve
  // start hours need about 1320pt of table and A4 landscape has 674, so the
  // columns came out too narrow to hold a treatment and the sheet fell back to
  // unlabelled three-hour bands anyway.
  //
  // Morning ends at midday and the afternoon at 16:00 because that is what the
  // words mean. The outer edges stretch to the centre's opening hours, and
  // further if anything is scheduled outside them, so a 07:00 yoga class has a
  // column to sit in rather than earning a fourth column of its own.
  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const endTimes = [
    ...appts.filter((a) => onShift.some((s) => teamOf(a).includes(s.id))).map((a) => toMinutes(a.start_time) + (a.duration_minutes || 0)),
    ...eventsOnStaff.map((e) => toMinutes(e.end_time)),
  ];
  const dayStart = Math.min(toMinutes(input.openingTime), MIDDAY, ...startTimes.map(toMinutes));
  const dayEnd = Math.max(toMinutes(input.closingTime), AFTERNOON_END, ...endTimes);
  const slots = [
    { label: `Morning ${hhmm(dayStart)}–${hhmm(MIDDAY)}`, start: dayStart, end: MIDDAY },
    { label: `Afternoon ${hhmm(MIDDAY)}–${hhmm(AFTERNOON_END)}`, start: MIDDAY, end: AFTERNOON_END },
    { label: `Evening ${hhmm(AFTERNOON_END)}–${hhmm(dayEnd)}`, start: AFTERNOON_END, end: dayEnd },
  ];

  const working: RotaRow[] = [];
  const out: RotaRow[] = [];
  for (const s of staff) {
    const offs = offsByStaff.get(s.id) || [];
    const fullDay = offs.find(isFullDay);
    const reason = (fullDay || offs[0])?.description || '';
    if (fullDay) {
      out.push({ name: s.name, note: reason || 'Not available', cells: slots.map(() => []), available: false, booked: 0 });
      continue;
    }
    const mine = appts.filter((a) => teamOf(a).includes(s.id));
    const myEvents = events.filter((e) => eventAppliesToStaff(e, s.id));
    const cells = slots.map((slot) => {
      const inSlot = (t: string) => toMinutes(t) >= slot.start && toMinutes(t) < slot.end;
      const lines: RotaLine[] = [
        ...mine.filter((a) => inSlot(a.start_time)).flatMap((a) => {
          const partners = teamOf(a).filter((id) => id !== s.id).map((id) => staffName.get(id) || id);
          return [
            {
              t: a.start_time,
              bold: true,
              text: [
                `${therapyById[a.therapy_id] || a.therapy_id} ${a.duration_minutes || 0}m`,
                patientById[a.patient_id] || a.patient_id,
                a.room_id ? roomById[a.room_id] || a.room_id : '',
              ].filter(Boolean).join(' · '),
            },
            // Who they are working with, under the treatment it belongs to.
            ...(partners.length ? [{ t: a.start_time, bold: false, noTime: true, text: `with ${partners.join(' & ')}` }] : []),
          ];
        }),
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
            noTime: true,
            // States its own hours in every column it covers, like every other
            // entry on the sheet. An absence shortened to 'Off' in the columns
            // after the first was readable when a column was one hour and is
            // not now: 'Off' in a column headed 16:00-21:00 reads as the whole
            // evening. Two wide columns repeating one short line is cheaper
            // than a reader guessing which hours are gone.
            text: `Not available ${h.start_time}–${h.end_time} — ${h.description || 'time off'}`,
          })),
      ];
      return lines.sort((m, n) => m.t.localeCompare(n.t));
    });
    // Assisting counts the same as leading: the assistant is just as busy.
    // Overlaps are merged, so a treatment running into an event counts once.
    const spans = [
      ...mine.map((a) => [toMinutes(a.start_time), toMinutes(a.start_time) + (a.duration_minutes || 0)]),
      ...myEvents.map((e) => [toMinutes(e.start_time), toMinutes(e.end_time)]),
    ].sort((m, n) => m[0] - n[0]);
    let booked = 0;
    let reach = -1;
    for (const [from, to] of spans) {
      booked += Math.max(0, to - Math.max(from, reach));
      reach = Math.max(reach, to);
    }
    working.push({ name: s.name, note: booked ? formatBooked(booked) : '', cells, available: true, booked });
  }

  return { slots, rows: [...working, ...out] };
};

/**
 * The same day as the centre sheet, turned on its side: therapists down the
 * page, time across. The centre sheet is read by a resident looking for their
 * own row; this one is read by the team and whoever is running the day.
 */
export async function generateTherapistRotaPdf(dateISO: string, prisma: PrismaClient, staffId?: string): Promise<Buffer> {
  // 1cm all round. The rota is read off a board, so the page is worth more
  // than the white edge around it.
  const margin = 28.35;
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
    openingTime: settings?.opening_time || '09:00',
    closingTime: settings?.closing_time || '18:00',
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

  const lineText = (l: RotaLine) => (l.noTime ? l.text : `${l.t} ${l.text}`);

  // Rows in a group print under a heading that says what the group is, so the
  // sheet answers 'who is in today' before it answers 'doing what'. A single
  // therapist asked for by name gets neither heading: it is their own day.
  type Heading = { kind: 'heading'; title: string; group: number };
  type Row = { kind: 'row'; group: number } & RotaRow;
  const items: (Row | Heading)[] = [];
  if (staffId) {
    for (const r of rota.rows) items.push({ kind: 'row', group: -1, ...r });
  } else {
    // Three groups, in the order the sheet is used: who has treatments today,
    // who is in but has none, then who is not in at all. A therapist with an
    // empty row scattered among busy ones was read as a gap in the day rather
    // than as someone free to take work, and there are usually several.
    const busy = (r: RotaRow) => r.cells.some((c) => c.length > 0);
    const groups: [string, (r: RotaRow) => boolean][] = [
      ['Working today', (r) => r.available && busy(r)],
      ['Working today, nothing booked', (r) => r.available && !busy(r)],
      ['Not available today', (r) => !r.available],
    ];
    for (const [title, match] of groups) {
      const group = rota.rows.filter(match);
      if (group.length === 0) continue;
      const at = items.length;
      items.push({ kind: 'heading', group: at, title: `${title} — ${group.length}` });
      for (const r of group) items.push({ kind: 'row', group: at, ...r });
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
      const shortened = shortenWords(lineText(l), colWidths[c + 1] - 10, widthOfWord);
      l.text = l.noTime ? shortened : shortened.slice(l.t.length + 1);
    }));
  }

  // Measured, not assumed: a column header is two lines now — what the column
  // is called and the hours it covers — and a fixed 18pt printed the hours on
  // top of the group heading below.
  applyHeadFont();
  const headerH = Math.max(18, ...headers.map((h, k) => doc.heightOfString(h, { width: colWidths[k] - 8 }) + 8));
  const FOOTER_H = 14;
  // A page that carries on a group repeats that group's heading. A rota is read
  // where it hangs, and a second page that does not say whether these people are
  // working or off is worse than no second page.
  const continuedTitle = (it: Row) => `${(items[it.group] as Heading).title} (continued)`;
  const pageBottom = doc.page.height - doc.page.margins.bottom - FOOTER_H;

  const SEP_H = 4;
  const timeWidth = (l: RotaLine) => {
    doc.font('Helvetica-Bold').fontSize(cellFont);
    return doc.widthOfString(`${l.t} `);
  };
  // Measured the way it is drawn: the description sits to the right of the bold
  // time and wraps in what is left of the column. Measuring the full width
  // instead would under-measure and overlap the next entry, and PDFKit does not
  // say when it has.
  const lineHeight = (l: RotaLine, colW: number) => {
    const tw = l.noTime ? 0 : timeWidth(l);
    doc.font('Helvetica').fontSize(cellFont);
    return Math.max(doc.currentLineHeight(), doc.heightOfString(l.text, { width: colW - 8 - tw }));
  };
  const cellHeight = (cell: RotaLine[], colW: number) =>
    cell.reduce((sum, l) => sum + lineHeight(l, colW), 0) + Math.max(0, cell.length - 1) * SEP_H;
  const headingHeight = (title: string) => {
    applyHeadFont();
    doc.fontSize(cellFont + 1);
    return doc.heightOfString(title, { width: w - 8 }) + 8;
  };
  const itemHeight = (it: Row | Heading) => {
    if (it.kind === 'heading') return headingHeight(it.title);
    doc.font('Helvetica-Bold').fontSize(cellFont);
    const nameH = doc.heightOfString(`${it.name}${it.note ? `\n${it.note}` : ''}`, { width: colWidths[0] - 8 }) + 6;
    return Math.max(18, nameH, ...it.cells.map((cell, c) => cellHeight(cell, colWidths[c + 1]) + 6));
  };
  const heights = items.map(itemHeight);

  // Page breaks are chosen before anything is drawn: PDFKit cannot unpaint a
  // row, and text past the bottom margin moves to the next page while the box
  // it belongs in stays here.
  const pageStarts = new Set<number>([0]);
  {
    // What a page costs before a single row is drawn: the table's header row,
    // plus the repeated group heading when the page opens mid-group.
    const overheadAt = (start: number) => {
      const it = items[start];
      return headerH + (it.kind === 'row' && it.group >= 0 ? headingHeight(continuedTitle(it)) : 0);
    };
    let used = 0;
    let available = pageBottom - startY - overheadAt(0);
    for (let r = 0; r < items.length; r++) {
      if (r > 0 && used + heights[r] > available) {
        const start = items[r - 1].kind === 'heading' && r - 1 > 0 ? r - 1 : r;
        pageStarts.add(start);
        available = pageBottom - startY - overheadAt(start);
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
      // Reversed out: the header is the one row that has to be findable from
      // across the room, and on a sheet with no other colour on it black is
      // the only weight available.
      doc.save();
      doc.rect(colX[k], yy, colWidths[k], headerH).fill('#000');
      doc.restore();
      doc.rect(colX[k], yy, colWidths[k], headerH).stroke();
      const th = doc.heightOfString(h, { width: colWidths[k] - 8 });
      doc.fillColor('#fff').text(h, colX[k] + 4, yy + Math.max(5, (headerH - th) / 2), { width: colWidths[k] - 8, align: 'center' }).fillColor('#000');
    });
    yy += headerH;
  };
  const drawHeading = (title: string) => {
    const h = headingHeight(title);
    doc.save();
    doc.rect(x, yy, w, h).fillOpacity(0.07).fill('#000');
    doc.restore();
    doc.rect(x, yy, w, h).stroke();
    doc.font('Helvetica-Bold').fontSize(cellFont + 1).text(title, x + 4, yy + 3, { width: w - 8 });
    yy += h;
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
    if (r > 0 && pageStarts.has(r)) {
      startPage(false);
      if (it.kind === 'row' && it.group >= 0) drawHeading(continuedTitle(it));
    }
    if (it.kind === 'heading') {
      drawHeading(it.title);
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
      cell.forEach((l, i) => {
        // A column this wide holds four treatments, and each one wraps. Without
        // a line between them the gap inside an entry looks like the gap
        // between two, and the cell reads as one long instruction.
        if (i > 0) {
          doc.save();
          doc.moveTo(colX[k] + 4, ty + SEP_H / 2).lineTo(colX[k] + colWidths[k] - 4, ty + SEP_H / 2)
            .lineWidth(0.4).dash(1.5, { space: 1.5 }).strokeColor('#999').stroke();
          doc.restore();
          ty += SEP_H;
        }
        const h = lineHeight(l, colWidths[k]);
        if (l.grey) {
          doc.save();
          doc.rect(colX[k] + 1, ty - 2, colWidths[k] - 2, h + 2).fillOpacity(0.12).fill('#000');
          doc.restore();
        }
        if (l.grey) doc.fillColor('#555');
        // Only the time is bold. Bolding the whole entry made every entry
        // shout, which is the same as none of them doing. Note that pdftoppm
        // here renders both Helvetica faces with the same substitute, so a
        // rendered PNG cannot be used to check weight — read the content
        // stream, or open the PDF.
        if (l.noTime) {
          doc.font('Helvetica').fontSize(cellFont).text(l.text, colX[k] + 4, ty, { width: colWidths[k] - 8 });
        } else {
          // Drawn as two runs rather than one wrapped line so the times form a
          // column down the left of the cell and a description that wraps sits
          // clear of them. A reader looking for 'what is next' finds every
          // time in the same place instead of hunting for it in a paragraph.
          const tw = timeWidth(l);
          doc.font('Helvetica-Bold').fontSize(cellFont).text(l.t, colX[k] + 4, ty);
          doc.font('Helvetica').fontSize(cellFont)
            .text(l.text, colX[k] + 4 + tw, ty, { width: colWidths[k] - 8 - tw });
        }
        doc.fillColor('#000');
        ty += h;
      });
    });
    yy += rowH;
  }

  doc.end();
  return await done;
}
