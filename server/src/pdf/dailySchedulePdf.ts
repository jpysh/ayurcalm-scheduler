declare module 'pdfkit';
import PDFDocument from 'pdfkit';
import { PrismaClient } from '@prisma/client';

const ADMIN_TZ = process.env.ADMIN_TZ || 'Asia/Kolkata';
const fmtLong = (isoDate: string) => {
  const d = new Date(isoDate);
  return new Intl.DateTimeFormat('en-GB', { timeZone: ADMIN_TZ, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(d);
};

const addHeader = (doc: any, dateStr: string) => {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  const top = doc.page.margins.top;
  let y = top;
  // Your centre's name on the printed day sheet. Set CENTRE_NAME in .env.
  const centreName = process.env.CENTRE_NAME || 'Wellness Centre';
  doc.font('Helvetica-Bold').fontSize(14).text(centreName, x, y, { align: 'center', width: w });
  y = doc.y;
  doc.font('Helvetica-Bold').fontSize(14).text('Treatment, Consultation, Orientation Schedule', x, y, { align: 'center', width: w });
  y = doc.y;
  doc.font('Helvetica-Bold').fontSize(14).text(fmtLong(dateStr), x, y, { align: 'center', width: w });
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

  const [rooms, patients, therapies, staff, appts, eventsByDate, weeklyEvents] = await Promise.all([
    prisma.therapyRoom.findMany(),
    prisma.patient.findMany(),
    prisma.therapy.findMany(),
    prisma.staff.findMany(),
    prisma.appointment.findMany({ where: { scheduled_date: day } }),
    prisma.programEvent.findMany({ where: { OR: [{ date: day }, { AND: [{ start_date: { lte: day } }, { end_date: { gte: day } }] }] } }),
    prisma.programEvent.findMany({ where: { recurrence: 'weekly' } }),
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

  const activePatients = patients.filter((p) => {
    const hasAppt = (apptsByPatient.get(p.id) || []).length > 0;
    return hasAppt;
  });

  activePatients.sort((a, b) => (patientById[a.id] || a.id).localeCompare(patientById[b.id] || b.id));
  const displayPatients = activePatients;

  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;

  const noColW = 24;
  doc.font('Helvetica').fontSize(9);
  const nameWidths = displayPatients.map((p) => doc.widthOfString(patientById[p.id] || p.id));
  const dietWidths = displayPatients.map((p) => doc.widthOfString(p.diet_plan || ''));
  const maxNameW = Math.max(0, ...nameWidths);
  const maxDietW = Math.max(0, ...dietWidths);
  const patientColW = Math.min(140, Math.max(80, Math.ceil(maxNameW + 12)));
  const anyDiet = displayPatients.some((p) => !!(p.diet_plan && p.diet_plan.trim().length > 0));
  const dietColW = anyDiet ? Math.min(120, Math.max(90, Math.ceil(maxDietW + 12))) : 0;
  const minSlotW = 30;
  const availableW = w - noColW - patientColW - (anyDiet ? dietColW : 0);
  const slotW = Math.max(minSlotW, Math.floor(availableW / Math.max(1, timeSlots.length)));

  addHeader(doc, dateISO);
  const startY = doc.y + 2;

  if (displayPatients.length === 0) {
    doc.fontSize(12).text('No scheduled activities for this date.', doc.page.margins.left, doc.page.margins.top + 20);
    doc.end();
    return await done;
  }

  let yy = startY;
  const maxContentHeight = doc.page.height - doc.page.margins.bottom - yy;
  const headers = ['No', 'Patient', ...timeSlots, ...(anyDiet ? ['Diet'] : [])];
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
      if (anyDiet) row.push(p.diet_plan || '');
      return row;
    });
  const mergedRows = rawRows.map((row) => [...row]);
  const rowCount = rawRows.length;
  const timeColStart = 2;
  const timeColEndExclusive = timeColStart + timeSlots.length;
  for (let col = timeColStart; col < timeColEndExclusive; col++) {
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
      r += span;
    }
  }
  const headerH = 18;
  const pageRowLimit = Number.MAX_SAFE_INTEGER;
  let i = 0;
  let pageHeaders: string[] = [];
  let pageDrawIdxs: number[] = [];
  const computePageLayout = () => {
    doc.font('Helvetica').fontSize(9);
    // Select time columns with content among remaining rows
    const selectedTimeIdxs: number[] = [];
    for (let tIdx = 0; tIdx < timeSlots.length; tIdx++) {
      const colIdx = 2 + tIdx;
      let hasContent = false;
      for (let r = i; r < rowCount; r++) {
        if ((rawRows[r][colIdx] || '').length > 0) { hasContent = true; break; }
      }
      if (hasContent) selectedTimeIdxs.push(colIdx);
    }

    // Measure widths for selected columns
    const idxNo = 0;
    const idxPatient = 1;
    const patientMin = 70, patientMax = 140;
    const slotMin = 30, slotMax = 110;
    const dietMin = 80, dietMax = 120;
    const headerWidths: number[] = headers.map((h) => Math.ceil(doc.widthOfString(h)) + 8);
    const patientW = Math.max(headerWidths[idxPatient], ...Array.from({ length: rowCount - i }, (_, r) => Math.ceil(doc.widthOfString(mergedRows[i + r][idxPatient] || '')) + 8));
    const timeWs: number[] = selectedTimeIdxs.map((colIdx) => {
      const maxCellW = Math.max(headerWidths[colIdx], ...Array.from({ length: rowCount - i }, (_, r) => Math.ceil(doc.widthOfString(mergedRows[i + r][colIdx] || '')) + 8));
      return Math.max(slotMin, Math.min(slotMax, maxCellW));
    });
    const hasDiet = anyDiet;
    const dietIdx = headers.length - 1;
    const dietW = hasDiet ? Math.max(headerWidths[dietIdx], ...Array.from({ length: rowCount - i }, (_, r) => Math.ceil(doc.widthOfString(mergedRows[i + r][dietIdx] || '')) + 8)) : 0;

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
          return slotMin;
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
    pageHeaders = ['No', 'Patient', ...selectedTimeIdxs.map((colIdx) => headers[colIdx]), ...(hasDiet ? ['Diet'] : [])];
  };
  computePageLayout();
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
  drawHeaderRow();
  doc.font('Helvetica').fontSize(9);
  let rowsOnPage = 0;
  let pageCells: { k: number; text: string; top: number; height: number }[] = [];
  let pageRowTops: number[] = [];
  let pageRowHeights: number[] = [];
  for (; i < rowCount; i++) {
    const heights: number[] = [];
    for (let c = 0; c < pageDrawIdxs.length; c++) {
      const k = pageDrawIdxs[c];
      const text = mergedRows[i][k] || '';
      const h = doc.heightOfString(text, { width: colWidths[c] - 8 });
      heights.push(h + 6);
    }
    const rowH = Math.max(18, ...heights);
    // no alternate row shading (B/W print)
    let cx2 = x;
    for (let c = 0; c < pageDrawIdxs.length; c++) {
      const k = pageDrawIdxs[c];
      const rawText = rawRows[i][k] || '';
      if (k >= timeColStart && k < timeColEndExclusive && rawText) {
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
    const shouldBreakByBottom = yy > doc.page.height - doc.page.margins.bottom - 10 && i < rowCount - 1;
    if (shouldBreakByBottom) {
      doc.font('Helvetica').fontSize(9);
      for (const k of pageDrawIdxs.filter((idx) => idx >= timeColStart && idx < timeColEndExclusive)) {
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
      doc.addPage();
      addHeader(doc, dateISO);
      yy = doc.y + 2;
      rowsOnPage = 0;
      computePageLayout();
      drawHeaderRow();
      doc.font('Helvetica').fontSize(9);
    }
  }
  if (pageCells.length > 0) {
    doc.font('Helvetica').fontSize(9);
    for (const k of pageDrawIdxs.filter((idx) => idx >= timeColStart && idx < timeColEndExclusive)) {
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
  }

  doc.end();
  return await done;
}
