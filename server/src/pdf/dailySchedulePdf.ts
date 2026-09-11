declare module 'pdfkit';
import PDFDocument from 'pdfkit';
import { PrismaClient } from '@prisma/client';

const ADMIN_TZ = process.env.ADMIN_TZ || 'Asia/Kolkata';
const fmtLong = (isoDate: string) => {
  const d = new Date(isoDate);
  return new Intl.DateTimeFormat('en-GB', { timeZone: ADMIN_TZ, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(d);
};

const addHeader = (doc: any, dateStr: string, centreName: string) => {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  const top = doc.page.margins.top;
  // One line, so the table gets the rest of the page.
  doc.font('Helvetica-Bold').fontSize(14).text(`${centreName} \u2014 ${fmtLong(dateStr)}`, x, top, { align: 'center', width: w });
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

  const dayStart = '07:00', dayEnd = '19:00';
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
  const inWindow = (t: string) => t >= dayStart && t <= dayEnd;
  const eventsWindow = allEventsRaw.filter((e) => inWindow(e.start_time) && (e.patients_scope !== 'none'));

  const apptsDay = appts.filter((a) => inWindow(a.start_time));

  const timeSlotsSet = new Set<string>();
  apptsDay.forEach((a) => timeSlotsSet.add(a.start_time));
  eventsWindow.forEach((e) => timeSlotsSet.add(e.start_time));
  const timeSlots = Array.from(timeSlotsSet).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

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
  type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
  const mealOrder: MealKey[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
  const mealLabel: Record<MealKey, string> = { breakfast: 'B', lunch: 'L', dinner: 'D', snacks: 'S' };

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

  const dietFor = (patient: (typeof patients)[number]) => {
    const seg = segmentByPatient.get(patient.id);
    const tpl = seg?.Template ?? null;
    const overrides = (seg?.overrides || {}) as Record<string, string | undefined>;
    const hasTherapyToday = (apptsByPatient.get(patient.id) || []).length > 0;
    // A plan holds both sides: what to eat around treatment, and what to eat on
    // a rest day. A resident eats on both.
    const side = hasTherapyToday ? 'therapy' : 'rest';

    // The doctor's own wording for this patient wins; otherwise the plan's. That
    // is what lets a correction to the plan reach everyone still on it.
    const field = (name: string) => (overrides[name] ?? (tpl as Record<string, any> | null)?.[name] ?? '').toString().trim();

    const dayOverrides = dayMealsByPatient.get(patient.id) || {};
    const meals: Partial<Record<MealKey, string>> = {};
    for (const meal of mealOrder) {
      const text = (dayOverrides[meal] || field(`${side}_${meal}`)).trim();
      if (text) meals[meal] = text;
    }

    const noteParts: string[] = [];
    for (const meal of mealOrder) {
      // Keep a meal the day has no column for rather than dropping it.
      if (meals[meal] && !mealsWithColumn.has(meal)) noteParts.push(`${mealLabel[meal]}: ${meals[meal]}`);
    }
    for (const name of ['medication', ...(hasTherapyToday ? ['pre_therapy_notes', 'post_therapy_notes'] : [])]) {
      const text = field(name);
      if (text) noteParts.push(text);
    }

    const free = (patient.diet_plan || '').trim();
    if (free && Object.keys(meals).length === 0) noteParts.unshift(free);

    const label = tpl?.name || seg?.template_label || '';
    const notes = noteParts.join('; ');
    return { meals, notes: label && notes ? `${label}: ${notes}` : notes || (label && Object.keys(meals).length ? label : '') };
  };

  const dietByPatient = new Map(displayPatients.map((p) => [p.id, dietFor(p)] as const));

  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;

  const noColW = 24;
  doc.font('Helvetica').fontSize(9);
  const nameWidths = displayPatients.map((p) => doc.widthOfString(patientById[p.id] || p.id));
  const dietWidths = displayPatients.map((p) => doc.widthOfString(dietByPatient.get(p.id)?.notes || ''));
  const maxNameW = Math.max(0, ...nameWidths);
  const maxDietW = Math.max(0, ...dietWidths);
  const patientColW = Math.min(140, Math.max(80, Math.ceil(maxNameW + 12)));
  const anyDiet = displayPatients.some((p) => !!dietByPatient.get(p.id)?.notes);
  const dietColW = anyDiet ? Math.min(190, Math.max(120, Math.ceil(maxDietW + 12))) : 0;
  const minSlotW = 30;
  const availableW = w - noColW - patientColW - (anyDiet ? dietColW : 0);
  const slotW = Math.max(minSlotW, Math.floor(availableW / Math.max(1, timeSlots.length)));

  addHeader(doc, dateISO, centreName);
  const startY = doc.y + 2;

  if (displayPatients.length === 0) {
    doc.fontSize(12).text('No scheduled activities for this date.', doc.page.margins.left, doc.page.margins.top + 20);
    doc.end();
    return await done;
  }

  let yy = startY;
  const maxContentHeight = doc.page.height - doc.page.margins.bottom - yy;
  const headers = ['No', 'Patient', ...timeSlots, ...(anyDiet ? ['Diet notes'] : [])];
  let colWidths: number[] = [];
  const rawRows: string[][] = displayPatients.map((p, idx) => {
      const apptList = apptsByPatient.get(p.id) || [];
      const cells = timeSlots.map((t) => {
        const parts: string[] = [];
        const a = apptList.find((x) => x.start_time === t);
        if (a) {
          const therapyName = therapyById[a.therapy_id] || a.therapy_id;
          const staffName = a.staff_id ? (staffById[a.staff_id] || a.staff_id) : '';
          const roomName = a.room_id ? (roomById[a.room_id] || a.room_id) : '';
          const dur = a.duration_minutes || 0;
          const metaParts: string[] = [];
          if (staffName) metaParts.push(`Staff: ${staffName}`);
          if (roomName) metaParts.push(`Room: ${roomName}`);
          const meta = metaParts.join(', ');
          parts.push(`${therapyName} (${dur}m)${meta ? ' [' + meta + ']' : ''}`);
        }
        // A meal column carries this patient's own meal; the generic event name
        // only stands in when they have no plan of their own.
        const mealHere = mealByTimeSlot.get(t);
        const ownMeal = mealHere ? dietByPatient.get(p.id)?.meals[mealHere] : undefined;
        if (ownMeal) {
          parts.push(ownMeal);
          return parts.join(' | ');
        }
        const evs = eventsWindow.filter((e) => e.start_time === t && eventAppliesToPatient(e, p.id));
        if (evs.length > 0) {
          const e = evs[0];
          const act = e.activity_name;
          const lead = e.staff_id ? (staffById[e.staff_id] || e.staff_id) : '';
          const loc = e.room_id ? (roomById[e.room_id] || e.room_id) : '';
          const dur = durationBetween(e.start_time, e.end_time);
          const metaPartsEv: string[] = [];
          if (lead) metaPartsEv.push(`Staff: ${lead}`);
          if (loc) metaPartsEv.push(`Room: ${loc}`);
          const metaEv = metaPartsEv.join(', ');
          parts.push(`${act} (${dur}m)${metaEv ? ' [' + metaEv + ']' : ''}`);
          if (evs.length > 1) parts.push(`+${evs.length - 1} more`);
        }
        return parts.join(' | ') || '';
      });
      const row = [String(idx + 1), patientById[p.id] || p.id, ...cells];
      if (anyDiet) row.push(dietByPatient.get(p.id)?.notes || '');
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
      for (let i = 1; i < span; i++) {
        mergedRows[r + i][col] = '';
      }
      spanLengths.set(`${r}:${col}`, span);
      r += span;
    }
  }
  const headerH = 18;
  const pageRowLimit = Number.MAX_SAFE_INTEGER;
  let i = 0;
  let pageHeaders: string[] = [];
  let pageDrawIdxs: number[] = [];
  // `lastRow` is the last row this page will hold. Columns are chosen from the
  // rows actually on the page, so a start time used only by a later page does
  // not take width here — an empty column is a column the day did not need.
  const computePageLayout = (lastRow: number = rowCount - 1) => {
    doc.font('Helvetica').fontSize(9);
    const selectedTimeIdxs: number[] = [];
    for (let tIdx = 0; tIdx < timeSlots.length; tIdx++) {
      const colIdx = 2 + tIdx;
      let hasContent = false;
      for (let r = i; r <= lastRow; r++) {
        if ((rawRows[r][colIdx] || '').length > 0) { hasContent = true; break; }
      }
      if (hasContent) selectedTimeIdxs.push(colIdx);
    }

    // Measure widths for selected columns
    const idxNo = 0;
    const idxPatient = 1;
    const patientMin = 70, patientMax = 140;
    // A column narrower than its own header wraps '07:30' onto two lines, so the
    // floor is the header text itself.
    // ponytail: if a day has so many distinct start times that the minimums no
    // longer fit the page width, the table runs past the right margin. Splitting
    // time columns across pages is the fix when a centre hits it.
    const slotMin = 38, slotMax = 110;
    // A meal column holds a sentence rather than 'Lunch (30m)', so it needs more
    // room than a therapy slot before words start breaking mid-syllable.
    const mealSlotMin = 84;
    const slotFloor = (colIdx: number) =>
      mealByTimeSlot.has(timeSlots[colIdx - 2]) ? mealSlotMin : slotMin;
    const dietMin = 80, dietMax = 150;
    // Headers are drawn in bold 11; measuring them in regular 9 underestimates.
    doc.font('Helvetica-Bold').fontSize(11);
    const headerWidths: number[] = headers.map((h) => Math.ceil(doc.widthOfString(h)) + 8);
    doc.font('Helvetica').fontSize(9);
    const patientW = Math.max(headerWidths[idxPatient], ...Array.from({ length: lastRow - i + 1 }, (_, r) => Math.ceil(doc.widthOfString(mergedRows[i + r][idxPatient] || '')) + 8));
    const timeWs: number[] = selectedTimeIdxs.map((colIdx) => {
      const maxCellW = Math.max(headerWidths[colIdx], ...Array.from({ length: lastRow - i + 1 }, (_, r) => Math.ceil(doc.widthOfString(mergedRows[i + r][colIdx] || '')) + 8));
      return Math.max(slotFloor(colIdx), headerWidths[colIdx], Math.min(slotMax, maxCellW));
    });
    const hasDiet = anyDiet;
    const dietIdx = headers.length - 1;
    const dietW = hasDiet ? Math.max(headerWidths[dietIdx], ...Array.from({ length: lastRow - i + 1 }, (_, r) => Math.ceil(doc.widthOfString(mergedRows[i + r][dietIdx] || '')) + 8)) : 0;

    let pW = Math.max(patientMin, Math.min(patientMax, patientW));
    let dW = hasDiet ? Math.max(dietMin, Math.min(dietMax, dietW)) : 0;
    const widths = [noColW, pW, ...timeWs, ...(hasDiet ? [dW] : [])];
    const total = widths.reduce((a, b) => a + b, 0);
    if (total > w) {
      for (let iter = 0; iter < 3; iter++) {
        const over = widths.reduce((a, b) => a + b, 0) - w;
        if (over <= 0) break;
        const flexIdxs = widths.map((_, idx) => idx).filter((idx) => idx !== 0);
        const mins = widths.map((_, idx) => {
          if (idx === 0) return noColW;
          if (idx === 1) return patientMin;
          if (hasDiet && idx === widths.length - 1) return dietMin;
          const colIdx = selectedTimeIdxs[idx - 2];
          return colIdx === undefined ? slotMin : Math.max(slotFloor(colIdx), headerWidths[colIdx]);
        });
        const flexSum = flexIdxs.reduce((a, idx) => a + widths[idx], 0);
        for (const idx of flexIdxs) {
          const share = (widths[idx] / flexSum) * over;
          widths[idx] = Math.max(mins[idx], Math.floor(widths[idx] - share));
        }
      }
    }
    if (widths.reduce((a, b) => a + b, 0) < w) {
      for (let iter = 0; iter < 3; iter++) {
        let under = w - widths.reduce((a, b) => a + b, 0);
        if (under <= 0) break;
        const flexIdxs = widths.map((_, idx) => idx).filter((idx) => idx !== 0);
        const caps = widths.map((_, idx) => {
          if (idx === 0) return noColW;
          if (idx === 1) return patientMax;
          if (hasDiet && idx === widths.length - 1) return dietMax;
          return slotMax;
        });
        const room = flexIdxs.reduce((a, idx) => a + Math.max(0, caps[idx] - widths[idx]), 0);
        if (room <= 0) break;
        for (const idx of flexIdxs) {
          const capacity = Math.max(0, caps[idx] - widths[idx]);
          const delta = Math.min(capacity, Math.floor((capacity / room) * under));
          widths[idx] += delta;
          under -= delta;
        }
      }
    }
    colWidths = widths;
    pageDrawIdxs = [idxNo, idxPatient, ...selectedTimeIdxs, ...(hasDiet ? [dietIdx] : [])];
    pageHeaders = ['No', 'Patient', ...selectedTimeIdxs.map((colIdx) => headers[colIdx]), ...(hasDiet ? ['Diet notes'] : [])];
  };
  const drawHeaderRow = () => {
    doc.font('Helvetica-Bold').fontSize(11);
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
    doc.font('Helvetica').fontSize(9);
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
      const text = mergedRows[r][k] || '';
      if (!text) return 6;
      // A cell merged down N rows is painted as one box that tall, so it only
      // needs an Nth of its height from each row it covers.
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

    // ponytail: columns are chosen from every row still to be drawn, so a start
    // time nobody on this page uses can still take width. Choosing per page is
    // circular — narrower columns make rows shorter, which changes which rows
    // are on the page, which changes the columns — and needs the time bucketing
    // in #7 to settle. Day-wide is the honest version until then.
    computePageLayout();

    yy = headerTop;
    drawHeaderRow();
    doc.font('Helvetica').fontSize(9);
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
      addHeader(doc, dateISO, centreName);
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
