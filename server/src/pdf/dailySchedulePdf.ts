declare module 'pdfkit';
import PDFDocument from 'pdfkit';
import { resolveDiet, mealOrder, type MealKey } from '../dietResolution.js';
import { PrismaClient } from '@prisma/client';

const ADMIN_TZ = process.env.ADMIN_TZ || 'Asia/Kolkata';
const fmtLong = (isoDate: string) => {
  const d = new Date(isoDate);
  return new Intl.DateTimeFormat('en-GB', { timeZone: ADMIN_TZ, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(d);
};

export const addHeader = (doc: any, dateStr: string, centreName: string, everyone = '') => {
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

export const toMinutes = (t: string) => {
  const [hh, mm] = t.split(':').map((n) => parseInt(n, 10));
  return hh * 60 + mm;
};
export const durationBetween = (start: string, end: string) => Math.max(0, toMinutes(end) - toMinutes(start));

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

  // Meals no longer take columns in the grid. What a resident eats is the same
  // paragraph for everyone on their plan, so it belongs once in that plan's
  // heading; the sittings themselves are the same times for the whole centre and
  // are stated in the line under the title. What is left in the grid is what
  // differs person to person and hour to hour: treatment.
  const mealsWithColumn = new Set<MealKey>();

  // One time axis for the whole sheet, and it is the axis of the day actually
  // scheduled: bands come from the treatments and the events a resident is named
  // on, so a centre working 09:00-16:30 does not print columns for 08:00 or
  // 20:00. A band wider than an hour says so in its header, and every entry
  // states its own start time.
  const sharedEvents = eventsWindow.filter((e) => (e.patients_scope || 'all') !== 'custom');
  const ownEvents = eventsWindow.filter((e) => e.patients_scope === 'custom');
  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const startTimes = [...apptsDay.map((a) => a.start_time), ...ownEvents.map((e) => e.start_time)];
  const bucketsFor = (size: number) => new Set(startTimes.map((t) => Math.floor(toMinutes(t) / size) * size));
  // Widths are fixed rather than fitted to content, so no mix of start times can
  // push the table past the right margin. Time columns share what is left and
  // widen to two, three or four hours when an hour would be too narrow to read.
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  // A band has to be wide enough to print a treatment on one or two lines:
  // 'Padabhyanga 45m · Varsha Iyer · Chandra' down an hour-wide column is four
  // lines, and four lines a row is what made this sheet seven pages. Every entry
  // carries its own start time, so a wide band costs nothing in precision.
  const HOUR_MIN_W = 170;
  // The patient column is fitted to the longest name actually on the sheet
  // rather than fixed: a centre of short names was giving a third of that
  // column to white space the time columns needed.
  doc.font('Helvetica').fontSize(9);
  // Capped, because one unusually long name should not take width from every
  // time column on the sheet: a name past the cap is shortened with '..' the
  // way an overlong therapy name already is.
  const PATIENT_W = Math.min(104, Math.max(58, ...displayPatients.map((p) => doc.widthOfString(`${patientById[p.id] || p.id} `) + 10)));
  const hourShare = (size: number) => (pageW - PATIENT_W) / Math.max(1, bucketsFor(size).size);
  const bucket = [60, 120, 180, 240].find((size) => hourShare(size) >= HOUR_MIN_W) ?? 240;
  type Slot = { label: string; start: number; end: number };
  const timeSlots: Slot[] = [...bucketsFor(bucket)]
    .map((start) => ({ label: bucket > 60 ? `${hhmm(start)}\u2013${hhmm(start + bucket)}` : hhmm(start), start, end: start + bucket }))
    .sort((a, b) => a.start - b.start);
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


  const w = pageW;
  const x = doc.page.margins.left;

  // The table shrinks its own type rather than breaking words across lines: a
  // column narrower than its longest word gives 'Chatt / erjee', which on a
  // printed notice board reads as a fault. Set by fitTypeSize() below.
  let cellFont = 9;
  let headFont = 11;
  const useCellFont = () => doc.font('Helvetica').fontSize(cellFont);
  const useHeadFont = () => doc.font('Helvetica-Bold').fontSize(headFont);
  useCellFont();

  addHeader(doc, dateISO, centreName, everyoneLine);
  const startY = doc.y + 2;

  if (displayPatients.length === 0) {
    doc.fontSize(12).text('No scheduled activities for this date.', doc.page.margins.left, startY + 8);
    doc.end();
    return await done;
  }

  // Residents are grouped by the plan they are on, because the plan text is the
  // same forty words for a third of the centre. Alphabetical order scattered
  // each plan across every page and reprinted it on each of them; grouped, it is
  // one heading per plan and the rows below it carry only what is personal.
  //
  // Groups are keyed on the resolved text, not the plan's name, so one plan
  // makes more than one group whenever it genuinely says different things: its
  // rest-day side for a resident with no treatment today, and a meal written for
  // one person for this date. Those are not duplicates, and the heading says
  // which is which rather than leaving a reader to wonder.
  const noDr = (name: string) => name.replace(/^Dr\.?\s+/i, '');
  const hasOverrideToday = (id: string) => Object.keys(dayMealsByPatient.get(id) || {}).length > 0;
  const hasTherapyToday = (id: string) => (apptsByPatient.get(id) || []).length > 0;
  const groups = new Map<string, string[]>();
  for (const p of displayPatients) {
    // Someone with no plan at all is grouped by whether the centre owes them
    // one: a resident in house should have a plan, a patient in for a treatment
    // and going home should not.
    const key = notesFor(p.id) || (residentToday.has(p.id) ? '\u0000resident' : '\u0000outpatient');
    const held = groups.get(key);
    if (held) held.push(p.id); else groups.set(key, [p.id]);
  }

  type Group = { key: string; ids: string[]; plan: string; qualifier: string; title: string; body: string };
  const describe = ([key, ids]: [string, string[]]): Group => {
    const n = ids.length;
    if (key === '\u0000resident') return { key, ids, plan: '\uffff1', qualifier: '', body: '', title: `Residents with no diet plan \u2014 ${n} resident${n === 1 ? '' : 's'}` };
    if (key === '\u0000outpatient') return { key, ids, plan: '\uffff2', qualifier: '', body: '', title: `Outpatients \u2014 not staying \u2014 ${n} ${n === 1 ? 'person' : 'people'}` };
    const plan = dietByPatient.get(ids[0])?.planName || '';
    const body = plan && key.startsWith(`${plan}: `) ? key.slice(plan.length + 2) : key;
    const qualifier = ids.every((id) => hasOverrideToday(id)) ? 'changed for today'
      : ids.every((id) => !hasTherapyToday(id)) ? 'rest day'
      : '';
    const label = plan || 'Individual instructions';
    return {
      key, ids, plan: label, qualifier, body,
      title: `${label}${qualifier ? ` \u2014 ${qualifier}` : ''} \u2014 ${ids.length} resident${ids.length === 1 ? '' : 's'}`,
    };
  };
  const described = [...groups.entries()].map(describe);
  // Plans are ordered by their largest group, so the heading covering most of
  // the centre is on page one; the other sides of a plan follow it directly
  // rather than turning up three pages later under a title that looks the same.
  const planRank = new Map<string, number>();
  for (const g of described) planRank.set(g.plan, Math.max(planRank.get(g.plan) ?? 0, g.ids.length));
  const qualifierRank = (q: string) => (q === '' ? 0 : q === 'rest day' ? 1 : 2);
  const groupOrder = described.sort((a, b) =>
    (planRank.get(b.plan)! - planRank.get(a.plan)!)
    || a.plan.localeCompare(b.plan)
    || qualifierRank(a.qualifier) - qualifierRank(b.qualifier)
    || b.ids.length - a.ids.length);

  /** A line inside a time cell. Treatments are bold; food and events are not. */
  type Line = { t: string; text: string; bold: boolean };
  type Row = { kind: 'row'; name: string; cells: Line[][]; group: number };
  type Heading = { kind: 'heading'; title: string; body: string; group: number };
  const items: (Row | Heading)[] = [];
  for (const { ids, title, body } of groupOrder) {
    const group = items.length;
    items.push({ kind: 'heading', title, body, group });
    for (const id of ids) {
      const apptList = apptsByPatient.get(id) || [];
      const cells = timeSlots.map((slot) => {
        const inSlot = (t: string) => toMinutes(t) >= slot.start && toMinutes(t) < slot.end;
        return [
          ...apptList.filter((a) => inSlot(a.start_time)).map((a) => ({
            t: a.start_time,
            bold: true,
            text: [
              `${therapyById[a.therapy_id] || a.therapy_id} ${a.duration_minutes || 0}m`,
              a.staff_id ? noDr(staffById[a.staff_id] || a.staff_id) : '',
              a.room_id ? roomById[a.room_id] || a.room_id : '',
            ].filter(Boolean).join(' · '),
          })),
          ...ownEvents.filter((e) => inSlot(e.start_time) && eventAppliesToPatient(e, id)).map((e) => ({
            t: e.start_time,
            bold: false,
            text: `${e.activity_name} ${durationBetween(e.start_time, e.end_time)}m`,
          })),
        ].sort((m, n) => m.t.localeCompare(n.t));
      });
      items.push({ kind: 'row', name: patientById[id] || id, cells, group });
    }
  }

  // Columns: No, Patient, then one band of the day each. The plan text that used
  // to need the widest column on the page is a heading now.
  const headers = ['Patient', ...timeSlots.map((t) => t.label)];
  const colWidths = headers.map((_, k) =>
    k === 0 ? PATIENT_W : (w - PATIENT_W) / Math.max(1, timeSlots.length));
  const colX = headers.map((_, k) => x + colWidths.slice(0, k).reduce((a, b) => a + b, 0));

  // Every entry states its own start, so a 13:30 therapy in a 12:00-15:00 band
  // can never be read as starting at 12:00.
  const lineText = (l: Line) => `${l.t} ${l.text}`;

  /**
   * The largest type at which every column holds its longest word. A sheet a
   * size smaller is still read at arm's length; 'Agni / karma' is not.
   */
  const fitsWord = (word: string, colW: number) => doc.widthOfString(`${word} `) <= colW - 10;
  const rowItems = items.filter((it): it is Row => it.kind === 'row');
  const fitTypeSize = () => {
    // Stops at 8pt: below that the whole sheet gets hard to read to save one
    // long name, which is better shortened.
    for (const size of [9, 8.5, 8]) {
      cellFont = size;
      headFont = Math.min(11, size + 2);
      useCellFont();
      const fits = rowItems.every((r) =>
        r.name.split(/\s+/).every((word) => fitsWord(word, colWidths[0]))
        && r.cells.every((cell, c) => cell.every((l) =>
          lineText(l).split(/\s+/).every((word) => fitsWord(word, colWidths[c + 1])))));
      if (fits) return;
    }
  };
  fitTypeSize();
  // At the smallest type some words still do not fit: shorten those instead.
  const widthOfWord = (str: string) => doc.widthOfString(`${str} `);
  for (const r of rowItems) {
    r.name = shortenWords(r.name, colWidths[0] - 10, widthOfWord);
    // Shortened as the line is printed — with its start time — then the time is
    // taken back off, so a word is measured against the width it really has.
    r.cells.forEach((cell, c) => cell.forEach((l) => {
      l.text = shortenWords(lineText(l), colWidths[c + 1] - 10, widthOfWord).slice(l.t.length + 1);
    }));
  }

  const headerH = 18;
  // The page number sits inside the page, not in the bottom margin: text drawn
  // past the margin makes PDFKit start a page of its own, which is how a blank
  // first sheet appeared.
  const FOOTER_H = 14;
  const pageBottom = doc.page.height - doc.page.margins.bottom - FOOTER_H;
  // A page that continues a group repeats that group's whole heading — plan,
  // qualifier and the food — not just its title. A sheet on a notice board is
  // read where it hangs; one that sends the reader to the page before it has
  // failed at the only job it has.
  const headingOf = (it: Row | Heading) => items[it.group] as Heading;
  const continuedTitle = (h: Heading) => `${h.title} (continued)`;

  // Measured in the weight it is printed in: bold is wider, so measuring a
  // treatment in book weight gave a box one line too short and the last line of
  // the cell was drawn over the row below.
  const lineHeight = (l: Line, colW: number) => {
    doc.font(l.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(cellFont);
    return doc.heightOfString(lineText(l), { width: colW - 8 });
  };
  const cellHeight = (cell: Line[], colW: number) =>
    cell.reduce((sum, l) => sum + lineHeight(l, colW), 0);
  const headingHeight = (title: string, body: string) => {
    useHeadFont();
    doc.fontSize(cellFont + 1);
    let h = doc.heightOfString(title, { width: w - 8 });
    if (body) {
      useCellFont();
      h += doc.heightOfString(body, { width: w - 8 });
    }
    return h + 8;
  };
  const itemHeight = (it: Row | Heading) => {
    if (it.kind === 'heading') return headingHeight(it.title, it.body);
    // The name is printed bold in a fixed column and can take two lines of its
    // own, so it is measured with the rest: a long name was drawing over the
    // resident below it.
    doc.font('Helvetica-Bold').fontSize(cellFont);
    const nameH = doc.heightOfString(it.name, { width: colWidths[0] - 8 }) + 6;
    return Math.max(18, nameH, ...it.cells.map((cell, c) => cellHeight(cell, colWidths[c + 1]) + 6));
  };
  const heights = items.map(itemHeight);

  // Page breaks are chosen before anything is drawn, because PDFKit cannot
  // unpaint a row: text drawn past the bottom margin quietly moves to the next
  // page while the box it belongs in stays here.
  // What a page costs before any row is drawn: the table's own header row, and
  // the repeated heading when the page opens in the middle of a group.
  const overheadAt = (start: number) => {
    const it = items[start];
    const repeated = it.kind === 'row' ? headingHeight(continuedTitle(headingOf(it)), headingOf(it).body) : 0;
    return headerH + repeated;
  };
  const pageStarts = new Set<number>([0]);
  {
    let used = 0;
    let available = pageBottom - startY - overheadAt(0);
    for (let r = 0; r < items.length; r++) {
      if (r > 0 && used + heights[r] > available) {
        // A heading alone at the foot of a page belongs with its rows.
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
    useHeadFont();
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
      addHeader(doc, dateISO, centreName, everyoneLine);
      yy = doc.y + 2;
    }
    pageNo++;
    // Seven loose sheets on a notice board need to say which one they are.
    doc.font('Helvetica').fontSize(8)
      .text(`Page ${pageNo} of ${totalPages}`, x, pageBottom + 4, { width: w, align: 'center', lineBreak: false });
    drawHeaderRow();
  };

  const drawHeading = (title: string, body: string) => {
    const h = headingHeight(title, body);
    doc.save();
    doc.rect(x, yy, w, h).fillOpacity(0.07).fill('#000');
    doc.restore();
    doc.rect(x, yy, w, h).stroke();
    doc.font('Helvetica-Bold').fontSize(cellFont + 1).text(title, x + 4, yy + 3, { width: w - 8 });
    if (body) {
      useCellFont();
      doc.text(body, x + 4, doc.y, { width: w - 8 });
    }
    yy += h;
  };

  startPage(true);
  for (let r = 0; r < items.length; r++) {
    const it = items[r];
    if (r > 0 && pageStarts.has(r)) {
      startPage(false);
      if (it.kind === 'row') {
        const h = headingOf(it);
        drawHeading(continuedTitle(h), h.body);
      }
    }
    if (it.kind === 'heading') {
      drawHeading(it.title, it.body);
      continue;
    }
    const rowH = heights[r];
    doc.rect(colX[0], yy, colWidths[0], rowH).stroke();
    doc.font('Helvetica-Bold').fontSize(cellFont).text(it.name, colX[0] + 4, yy + 3, { width: colWidths[0] - 8 });
    it.cells.forEach((cell, c) => {
      const k = c + 1;
      doc.rect(colX[k], yy, colWidths[k], rowH).stroke();
      let ty = yy + 3;
      for (const l of cell) {
        // The one time-critical, person-specific thing on the sheet reads as
        // such: treatment in bold, the standing diet text beside it in book
        // weight.
        doc.font(l.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(cellFont);
        doc.text(lineText(l), colX[k] + 4, ty, { width: colWidths[k] - 8 });
        ty += doc.heightOfString(lineText(l), { width: colWidths[k] - 8 });
      }
    });
    yy += rowH;
  }

  doc.end();
  return await done;
}
