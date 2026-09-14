declare module 'pdfkit';
import PDFDocument from 'pdfkit';
import { resolveDiet, mealOrder, type MealKey } from '../dietResolution.js';
import { PrismaClient } from '@prisma/client';

const ADMIN_TZ = process.env.ADMIN_TZ || 'Asia/Kolkata';
const fmtLong = (isoDate: string) => {
  const d = new Date(isoDate);
  return new Intl.DateTimeFormat('en-GB', { timeZone: ADMIN_TZ, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(d);
};

const addHeader = (doc: any, dateStr: string, centreName: string, everyone = '') => {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  const top = doc.page.margins.top;
  // One line, so the table gets the rest of the page.
  doc.font('Helvetica-Bold').fontSize(14).text(`${centreName} \u2014 ${fmtLong(dateStr)}`, x, top, { align: 'center', width: w });
  // Events for everyone are the same in every row, so they print once here
  // instead of taking a column each.
  if (everyone) doc.font('Helvetica').fontSize(9).text(`For everyone: ${everyone}`, x, doc.y + 2, { align: 'center', width: w });
  doc.moveDown(0.5);
};

const drawTable = (
  doc: any,
  x: number,
  y: number,
  colWidths: number[],
  headers: string[],
  rows: string[][],
  maxRows?: number
) => {
  const rowH = 20;
  doc.font('Helvetica-Bold').fontSize(10);
  let cx = x;
  headers.forEach((h, i) => {
    doc.rect(cx, y, colWidths[i], rowH).stroke();
    doc.text(h, cx + 4, y + 4, { width: colWidths[i] - 8, valign: 'center' });
    cx += colWidths[i];
  });
  doc.font('Helvetica').fontSize(9);
  let yy = y + rowH;
  const limit = typeof maxRows === 'number' ? Math.min(maxRows, rows.length) : rows.length;
  for (let i = 0; i < limit; i++) {
    const fill = i % 2 === 1;
    if (fill) {
      doc.save();
      doc.rect(x, yy, colWidths.reduce((a, b) => a + b, 0), rowH).fillOpacity(0.05).fill('#000').restore();
    }
    let cx2 = x;
    rows[i].forEach((cell, k) => {
      doc.rect(cx2, yy, colWidths[k], rowH).stroke();
      doc.text(cell, cx2 + 4, yy + 4, { width: colWidths[k] - 8, valign: 'center' });
      cx2 += colWidths[k];
    });
    yy += rowH;
  }
  return yy;
};

/**
 * Shortens any word too wide for its column to what fits, plus '..', so a
 * narrow hour column prints 'Dhanyamla.. 60m' rather than breaking the word
 * across two lines. Words that fit are left alone.
 */
export const shortenWords = (text: string, maxW: number, widthOf: (s: string) => number) =>
  text.split('\n').map((line) => line.split(' ').map((word) => {
    if (widthOf(word) <= maxW) return word;
    let cut = word.length - 1;
    while (cut > 1 && widthOf(`${word.slice(0, cut)}..`) > maxW) cut--;
    return `${word.slice(0, cut)}..`;
  }).join(' ')).join('\n');

const toMinutes = (t: string) => {
  const [hh, mm] = t.split(':').map((n) => parseInt(n, 10));
  return hh * 60 + mm;
};
const durationBetween = (start: string, end: string) => Math.max(0, toMinutes(end) - toMinutes(start));

export async function generateDailySchedulePdf(dateISO: string, prisma: PrismaClient): Promise<Buffer> {
  const margin = 36;
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: margin, bottom: margin, left: margin, right: margin } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: any) => chunks.push(Buffer.from(c)));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const day = new Date(dateISO);

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const centreName = settings?.centre_name || process.env.CENTRE_NAME || 'Wellness Centre';

  const [rooms, patients, therapies, staff, appts, eventsByDate, weeklyEvents, dietDay, dietSegments, staysToday] = await Promise.all([
    prisma.therapyRoom.findMany(),
    prisma.patient.findMany(),
    prisma.therapy.findMany(),
    prisma.staff.findMany(),
    prisma.appointment.findMany({ where: { scheduled_date: day } }),
    prisma.programEvent.findMany({ where: { OR: [{ date: day }, { AND: [{ start_date: { lte: day } }, { end_date: { gte: day } }] }] } }),
    prisma.programEvent.findMany({ where: { recurrence: 'weekly' } }),
    prisma.dietPlan.findMany({ where: { date: day } }),
    prisma.dietPlanSegment.findMany({ where: { start_date: { lte: day }, end_date: { gte: day } }, include: { Template: true } }),
    prisma.patientStay.findMany({ where: { start_date: { lte: day }, end_date: { gte: day } } }),
  ]);

  const roomById = Object.fromEntries(rooms.map((r) => [r.id, r.name]));
  const patientById = Object.fromEntries(patients.map((p) => [p.id, p.name]));
  const therapyById = Object.fromEntries(therapies.map((t) => [t.id, t.name]));
  const staffById = Object.fromEntries(staff.map((s) => [s.id, s.name]));

  const weekdayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
  const weekday = weekdayNames[day.getDay()];
  const filteredWeekly = weeklyEvents.filter((e) => Array.isArray(e.weekdays) && e.weekdays.includes(weekday));
  const allEventsRaw = [...eventsByDate, ...filteredWeekly];
  // Everything on the day prints, whatever the hours: a booking the sheet
  // leaves out is one a therapist never sees.
  const eventsWindow = allEventsRaw.filter((e) => e.patients_scope !== 'none');
  const apptsDay = appts;

  const apptsByPatient = new Map<string, typeof apptsDay>();
  for (const a of apptsDay) {
    const arr = apptsByPatient.get(a.patient_id) || [];
    arr.push(a);
    apptsByPatient.set(a.patient_id, arr);
  }

  const eventAppliesToPatient = (e: any, patientId: string) => {
    const scope = e.patients_scope || 'all';
    if (scope === 'none') return false;
    if (scope === 'custom') return Array.isArray(e.patient_ids) && e.patient_ids.includes(patientId);
    return true;
  };

  // The sheet goes on a notice board, so a resident scanning for their own name
  // must find it even on a day with no therapy — their meals are still on it.
  const residentToday = new Set(staysToday.map((s) => s.patient_id));
  const activePatients = patients.filter(
    (p) => (apptsByPatient.get(p.id) || []).length > 0 || residentToday.has(p.id),
  );

  activePatients.sort((a, b) => (patientById[a.id] || a.id).localeCompare(patientById[b.id] || b.id));
  const displayPatients = activePatients;

  // What a patient eats today comes from three places, most specific first: a
  // DietPlan row written for this date, the template on the segment covering
  // this date, then the free-text field on the patient. Precedence is per meal,
  // so overriding breakfast leaves the rest of the plan standing.
  const dayMealsByPatient = new Map<string, Partial<Record<MealKey, string>>>();
  for (const d of dietDay) {
    const meals = dayMealsByPatient.get(d.patient_id) || {};
    meals[d.meal_time as MealKey] = [d.description, d.instructions].filter(Boolean).join(' \u2014 ');
    dayMealsByPatient.set(d.patient_id, meals);
  }

  const segmentByPatient = new Map<string, (typeof dietSegments)[number]>();
  for (const seg of dietSegments) {
    // A patient should not hold two overlapping segments, but if they do, the
    // one that started most recently is the one set last.
    const held = segmentByPatient.get(seg.patient_id);
    if (!held || seg.start_date > held.start_date) segmentByPatient.set(seg.patient_id, seg);
  }

  // The day already has a Breakfast, Lunch and Dinner column — those meals are
  // programme events like any other — so each patient's own meal goes in the
  // matching column rather than in a block of its own. Anything with no column
  // of its own (snacks, medication, therapy notes) goes to the notes column.
  const mealByTimeSlot = new Map<string, MealKey>();
  for (const e of eventsWindow) {
    const name = (e.activity_name || '').trim().toLowerCase();
    const meal = mealOrder.find((m) => name === m || name.startsWith(`${m} `));
    if (meal && !mealByTimeSlot.has(e.start_time)) mealByTimeSlot.set(e.start_time, meal);
  }
  const mealsWithColumn = new Set(mealByTimeSlot.values());

  // Columns are hours, not start times: a busy day has twenty distinct start
  // times and the page has room for about ten columns. A cell states its own
  // start when it is not on the hour. Meals keep a column at their own time
  // because the cell holds each patient's meal. If even hours cannot fit at the
  // smallest type, columns widen to two or three hours.
  const isMealEvent = (e: (typeof eventsWindow)[number]) => mealByTimeSlot.has(e.start_time);
  const sharedEvents = eventsWindow.filter((e) => !isMealEvent(e) && (e.patients_scope || 'all') !== 'custom');
  const ownEvents = eventsWindow.filter((e) => !isMealEvent(e) && e.patients_scope === 'custom');
  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const startTimes = [...apptsDay.map((a) => a.start_time), ...ownEvents.map((e) => e.start_time)];
  const bucketsFor = (size: number) => new Set(startTimes.map((t) => Math.floor(toMinutes(t) / size) * size));
  // Widths are fixed rather than fitted to content, so no mix of start times can
  // push the table past the right margin. Hour columns share what is left and
  // widen to two, three or four hours when an hour would be too narrow to read.
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const NO_W = 22, PATIENT_W = 90, MEAL_W = 95, NOTES_W = 160, HOUR_MIN_W = 48;
  const hourShare = (size: number) => (pageW - NO_W - PATIENT_W - NOTES_W - mealByTimeSlot.size * MEAL_W) / Math.max(1, bucketsFor(size).size);
  const bucket = [60, 120, 180, 240].find((size) => hourShare(size) >= HOUR_MIN_W) ?? 240;
  type Slot = { label: string; start: number; end: number; meal?: MealKey };
  const timeSlots = ([
    ...[...bucketsFor(bucket)].map((start) => ({ label: hhmm(start), start, end: start + bucket })),
    ...[...mealByTimeSlot].map(([t, meal]) => ({ label: `${meal[0].toUpperCase()}${meal.slice(1)} ${t}`, start: toMinutes(t), end: toMinutes(t), meal })),
  ] as Slot[]).sort((a, b) => a.start - b.start || (a.meal ? 1 : -1));
  const everyoneLine = [...sharedEvents]
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((e) => `${e.start_time} ${e.activity_name} ${durationBetween(e.start_time, e.end_time)}m`)
    .join('  \u00b7  ');

  const dietFor = (patient: (typeof patients)[number]) => {
    const seg = segmentByPatient.get(patient.id);
    return resolveDiet({
      template: seg?.Template ?? null,
      overrides: (seg?.overrides || null) as Record<string, string | undefined> | null,
      dayMeals: dayMealsByPatient.get(patient.id) || {},
      hasTherapyToday: (apptsByPatient.get(patient.id) || []).length > 0,
      mealsWithColumn,
      freeText: patient.diet_plan,
      segmentLabel: seg?.template_label,
    });
  };

  const dietByPatient = new Map(displayPatients.map((p) => [p.id, dietFor(p)] as const));
  // Everyone reads only their own row, so how to eat around treatment sits
  // there too, after the plan, snacks and medication.
  const notesFor = (id: string) => {
    const diet = dietByPatient.get(id);
    return [diet?.notes, diet?.therapyNotes && `Treatment: ${diet.therapyNotes}`].filter(Boolean).join('. ');
  };

  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;

  const noColW = 24;
  // The table shrinks its own type rather than breaking words across lines: a
  // column narrower than its longest word gives 'Chatt / erjee', which on a
  // printed notice board reads as a fault. Set by fitTypeSize() below.
  let cellFont = 9;
  let headFont = 11;
  const useCellFont = () => doc.font('Helvetica').fontSize(cellFont);
  const useHeadFont = () => doc.font('Helvetica-Bold').fontSize(headFont);
  useCellFont();
  const anyDiet = displayPatients.some((p) => !!notesFor(p.id));

  addHeader(doc, dateISO, centreName, everyoneLine);
  const startY = doc.y + 2;

  if (displayPatients.length === 0) {
    doc.fontSize(12).text('No scheduled activities for this date.', doc.page.margins.left, doc.page.margins.top + 20);
    doc.end();
    return await done;
  }

  let yy = startY;
  const maxContentHeight = doc.page.height - doc.page.margins.bottom - yy;
  const headers = ['No', 'Patient', ...timeSlots.map((t) => t.label), ...(anyDiet ? ['Notes'] : [])];
  let colWidths: number[] = [];
  const rawRows: string[][] = displayPatients.map((p, idx) => {
      const apptList = apptsByPatient.get(p.id) || [];
      const noDr = (name: string) => name.replace(/^Dr\.?\s+/i, '');
      const cells = timeSlots.map((slot) => {
        if (slot.meal) {
          // A patient's own meal; the meal's name only stands in when they have no plan.
          const own = dietByPatient.get(p.id)?.meals[slot.meal];
          if (own) return own;
          const applies = eventsWindow.some((e) => e.start_time === hhmm(slot.start) && isMealEvent(e) && eventAppliesToPatient(e, p.id));
          return applies ? slot.label.split(' ')[0] : '';
        }
        const inSlot = (t: string) => toMinutes(t) >= slot.start && toMinutes(t) < slot.end;
        const lines = [
          ...apptList.filter((a) => inSlot(a.start_time)).map((a) => ({
            t: a.start_time,
            text: [
              `${therapyById[a.therapy_id] || a.therapy_id} ${a.duration_minutes || 0}m`,
              a.staff_id ? noDr(staffById[a.staff_id] || a.staff_id) : '',
              a.room_id ? roomById[a.room_id] || a.room_id : '',
            ].filter(Boolean).join(' \u00b7 '),
          })),
          ...ownEvents.filter((e) => inSlot(e.start_time) && eventAppliesToPatient(e, p.id)).map((e) => ({
            t: e.start_time,
            text: `${e.activity_name} ${durationBetween(e.start_time, e.end_time)}m`,
          })),
        ].sort((m, n) => m.t.localeCompare(n.t));
        return lines.map((l) => (l.t === slot.label ? l.text : `${l.t} ${l.text}`)).join('\n');
      });
      const row = [String(idx + 1), patientById[p.id] || p.id, ...cells];
      if (anyDiet) row.push(notesFor(p.id));
      return row;
    });
  const mergedRows = rawRows.map((row) => [...row]);
  // How many rows each merged cell covers, so its text can be measured against
  // the box it is actually painted in rather than against one row of it.
  const spanLengths = new Map<string, number>();
  const rowCount = rawRows.length;
  const timeColStart = 2;
  const timeColEndExclusive = timeColStart + timeSlots.length;
  // Patients on the same plan carry the same notes, so those cells merge down
  // the column the way a repeated therapy does — one box, read once.
  const notesColIdx = headers.length - 1;
  const isMergedCol = (k: number) =>
    (k >= timeColStart && k < timeColEndExclusive) || (anyDiet && k === notesColIdx);
  for (let col = timeColStart; col < timeColEndExclusive + (anyDiet ? 1 : 0); col++) {
    let r = 0;
    while (r < rowCount) {
      const value = rawRows[r][col];
      if (!value) { r++; continue; }
      let span = 1;
      while (r + span < rowCount && rawRows[r + span][col] === value) {
        span++;
      }
      for (let i = 0; i < span; i++) {
        if (i > 0) mergedRows[r + i][col] = '';
        spanLengths.set(`${r + i}:${col}`, span);
      }
      r += span;
    }
  }
  const headerH = 18;
  let i = 0;
  let pageHeaders: string[] = [];
  let pageDrawIdxs: number[] = [];
  // `lastRow` is the last row this page will hold. Columns are chosen from the
  // rows actually on the page, so a start time used only by a later page does
  // not take width here — an empty column is a column the day did not need.
  // A column narrower than its own header wraps '07:30' onto two lines, and one
  // narrower than its longest word breaks that word mid-syllable. Both are the
  // same fault on a printed sheet, so both set a floor.
  const widthOf = (colIdx: number, drawn: number[], hourW: number) => {
    if (colIdx === 0) return NO_W;
    if (colIdx === 1) return PATIENT_W;
    if (anyDiet && colIdx === headers.length - 1) return NOTES_W;
    return timeSlots[colIdx - 2].meal ? MEAL_W : hourW;
  };
  const layoutWidths = (drawn: number[]) => {
    const hours = drawn.filter((k) => k >= 2 && k < timeColEndExclusive && !timeSlots[k - 2].meal).length;
    const fixed = drawn.reduce((sum, k) => sum + (k >= 2 && k < timeColEndExclusive && !timeSlots[k - 2].meal ? 0 : widthOf(k, drawn, 0)), 0);
    const hourW = hours ? (w - fixed) / hours : 0;
    const widths = drawn.map((k) => widthOf(k, drawn, hourW));
    // A page with no therapy hours gives the spare width to its meal columns.
    const spare = w - widths.reduce((a2, b2) => a2 + b2, 0);
    const meals = drawn.map((k, c) => (k >= 2 && k < timeColEndExclusive && timeSlots[k - 2].meal ? c : -1)).filter((c) => c >= 0);
    if (spare > 0 && meals.length) for (const c of meals) widths[c] += spare / meals.length;
    return widths;
  };

  /**
   * The largest type at which every column holds its longest word. A sheet a
   * size smaller is still read at arm's length; 'Agni / karma' is not.
   */
  const allCols = headers.map((_, k) => k);
  // PDFKit wraps a word together with the space after it, so measure it that way.
  const fitsWord = (word: string, colW: number) => doc.widthOfString(`${word} `) <= colW - 10;
  const dayWidths = layoutWidths(allCols);
  const fitTypeSize = () => {
    // Stops at 8pt: below that the whole sheet gets hard to read to save one
    // long name, which is better shortened.
    for (const size of [9, 8.5, 8]) {
      cellFont = size;
      headFont = Math.min(11, size + 2);
      useCellFont();
      const fits = allCols.every((k, c) => rawRows.every((row) =>
        (row[k] || '').split(/\s+/).every((word) => fitsWord(word, dayWidths[c]))));
      if (fits) return;
    }
  };
  fitTypeSize();
  // At the smallest type some words still do not fit: shorten those instead.
  // Merging compares cell text, and the same text shortens the same way, so
  // merged cells stay merged.
  for (const rows of [rawRows, mergedRows]) {
    for (const row of rows) {
      allCols.forEach((k, c) => { if (row[k]) row[k] = shortenWords(row[k], dayWidths[c] - 10, (s) => doc.widthOfString(`${s} `)); });
    }
  }

  const computePageLayout = (lastRow: number = rowCount - 1) => {
    // A column nobody on this page uses is left out, and its width shared.
    const drawn = allCols.filter((k) => k < 2 || (anyDiet && k === headers.length - 1) ||
      rawRows.slice(i, lastRow + 1).some((row) => !!row[k]));
    colWidths = layoutWidths(drawn);
    pageDrawIdxs = drawn;
    pageHeaders = drawn.map((k) => headers[k]);
  };
  const drawHeaderRow = () => {
    useHeadFont();
    let cx = x;
    for (let i = 0; i < pageHeaders.length; i++) {
      doc.rect(cx, yy, colWidths[i], headerH).stroke();
      const h = doc.heightOfString(pageHeaders[i], { width: colWidths[i] - 8 });
      const ty = yy + Math.max(5, (headerH - h) / 2);
      doc.text(pageHeaders[i], cx + 4, ty, { width: colWidths[i] - 8, align: 'center' });
      cx += colWidths[i];
    }
    yy += headerH;
  };
  let rowsOnPage = 0;
  let pageCells: { k: number; text: string; top: number; height: number }[] = [];
  let pageRowTops: number[] = [];
  let pageRowHeights: number[] = [];
  // Appointment cells are collected while their rows are drawn, then painted in
  // one pass so a therapy repeated down a column becomes a single merged box.
  const flushPageCells = () => {
    if (pageCells.length === 0) return;
    useCellFont();
    for (const k of pageDrawIdxs.filter(isMergedCol)) {
      let idx = 0;
      const colCells = pageCells.filter((c) => c.k === k);
      while (idx < colCells.length) {
        const t = colCells[idx].text;
        if (!t) { idx++; continue; }
        let span = 1;
        let spanH = colCells[idx].height;
        while (idx + span < colCells.length && colCells[idx + span].text === t) {
          spanH += colCells[idx + span].height;
          span++;
        }
        const top = colCells[idx].top;
        const pos = pageDrawIdxs.indexOf(k);
        const cx = x + colWidths.slice(0, pos).reduce((a, b) => a + b, 0);
        doc.rect(cx, top, colWidths[pos], spanH).stroke();
        const th = doc.heightOfString(t, { width: colWidths[pos] - 8 });
        const ty = top + (spanH - th) / 2;
        doc.text(t, cx + 4, ty, { width: colWidths[pos] - 8 });
        idx += span;
      }
    }
    pageCells = [];
    pageRowTops = [];
    pageRowHeights = [];
  };

  const measureRow = (r: number) => {
    const heights = pageDrawIdxs.map((k, c) => {
      const text = rawRows[r][k] || '';
      if (!text) return 6;
      // A cell merged down N rows is painted as one box that tall, so every row
      // it covers, not just the first, takes an Nth of its height.
      const span = spanLengths.get(`${r}:${k}`) ?? 1;
      return doc.heightOfString(text, { width: colWidths[c] - 8 }) / span + 6;
    });
    return Math.max(18, ...heights);
  };
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  // Two passes: the first sizes columns against every remaining row to learn how
  // many fit, the second re-sizes against only those rows so the page keeps the
  // columns it actually uses.
  const layoutPage = () => {
    const headerTop = yy;

    // ponytail: columns are chosen from every row still to be drawn, so an hour
    // used only on a later page still takes width here. Choosing per page is
    // circular (column widths change row heights, which change the page).
    computePageLayout();

    yy = headerTop;
    drawHeaderRow();
    useCellFont();
  };
  layoutPage();

  for (; i < rowCount; i++) {
    let rowH = measureRow(i);
    // A row drawn past the bottom margin takes its cell text with it: PDFKit
    // paginates text that overflows the page, so the boxes stay here and the
    // therapy names silently move to the next page. Break before drawing.
    if (rowsOnPage > 0 && yy + rowH > pageBottom) {
      flushPageCells();
      doc.addPage();
      addHeader(doc, dateISO, centreName, everyoneLine);
      yy = doc.y + 2;
      rowsOnPage = 0;
      layoutPage();
      rowH = measureRow(i);
    }
    // no alternate row shading (B/W print)
    let cx2 = x;
    for (let c = 0; c < pageDrawIdxs.length; c++) {
      const k = pageDrawIdxs[c];
      const rawText = rawRows[i][k] || '';
      if (isMergedCol(k) && rawText) {
        pageCells.push({ k, text: rawText, top: yy, height: rowH });
      } else {
        doc.rect(cx2, yy, colWidths[c], rowH).stroke();
        const text = mergedRows[i][k] || '';
        const th = doc.heightOfString(text, { width: colWidths[c] - 8 });
        const ty = yy + Math.max(2, (rowH - th) / 2);
        doc.text(text, cx2 + 4, ty, { width: colWidths[c] - 8 });
      }
      cx2 += colWidths[c];
    }
    pageRowTops.push(yy);
    pageRowHeights.push(rowH);
    yy += rowH;
    rowsOnPage++;
  }
  flushPageCells();

  doc.end();
  return await done;
}
