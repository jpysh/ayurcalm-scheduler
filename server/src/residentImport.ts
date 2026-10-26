import { z } from 'zod';

/** A stay is whole days: arriving and leaving dates, no times. */
export const staySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((s) => s.end_date >= s.start_date, 'Leaving must be on or after arriving');

/** A new patient, as `POST /patients` takes one and as an imported row is checked (#741, #778). */
export const patientSchema = z.object({
  name: z.string().max(80, 'A name can be at most 80 characters'),
  gender: z.enum(['male','female','other']),
  phone: z.string().optional(),
  email: z.string().optional(),
  date_of_birth: z.string().optional(),
  emergency_contact: z.string().optional(),
  emergency_phone: z.string().optional(),
  address: z.string().optional(),
  country: z.string().optional(),
  id_number: z.string().optional(),
  visa_number: z.string().max(100).nullable().optional(),
  visa_valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).nullable().optional(),
  registration_number: z.string().optional(),
  medical_notes: z.string().optional(),
  medication: z.string().max(2000).nullable().optional(),
  food_limits: z.string().max(500).nullable().optional(),
  before_treatment: z.string().max(2000).nullable().optional(),
  after_treatment: z.string().max(2000).nullable().optional(),
  preferred_staff_id: z.string().uuid().nullable().optional(),
  /** False for a day patient. */
  on_site: z.boolean().default(true),
  /** A companion: sleeps and eats here, takes no treatments (#1195). */
  companion: z.boolean().optional(),
  /** The consultation to book with them, as `/consultations/next` offered it; none if left out. */
  consultation: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start_time: z.string().regex(/^\d\d:\d\d$/), staff_id: z.string().uuid(), room_id: z.string().uuid() }).optional(),
  /** Arriving and leaving. Without a stay a resident is never "in house" and never on the day sheet (#142). */
  stay: staySchema.optional(),
  /** The diet plan they follow for the whole stay. */
  template_id: z.string().uuid().optional(),
  /** The guest room the sheet preselected or the admin chose (#456); its type is their accommodation. */
  guest_room_id: z.string().uuid().nullable().optional(),
});

/**
 * Residents from a spreadsheet (#741, decision 2026-10-13-bulk-residents): a CSV
 * saved from Excel or Google Sheets, or rows copied and pasted (tab-separated).
 * Each row comes back ready or with what stops it, checked by the same rules as
 * one patient saved by hand; nothing is saved here and no row is dropped.
 */
export type RowProblem = 'no_name' | 'no_gender' | 'bad_date' | 'leaving_past' | 'leaving_before_arriving' | 'invalid';
export type CheckedRow = { line: number; name: string; gender: 'male' | 'female' | 'other' | null; arriving: string | null; leaving: string | null; phone: string; problems: RowProblem[] };

const COLUMNS: Record<'name' | 'gender' | 'arriving' | 'leaving' | 'phone', RegExp> = {
  name: /name|guest|resident|patient/,
  gender: /gender|sex/,
  arriving: /arriv|check.?in|from|start/,
  leaving: /leav|depart|check.?out|until|^to$|^end/,
  phone: /phone|mobile|tel|whats|contact/,
};

// Quoted fields may hold the delimiter or a line break, as Excel writes them.
function parseTable(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0];
  const sep = first.includes('\t') ? '\t' : first.split(';').length > first.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  row.push(cell); rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

const GENDERS: Record<string, CheckedRow['gender']> = { f: 'female', female: 'female', woman: 'female', w: 'female', lady: 'female', mrs: 'female', ms: 'female', m: 'male', male: 'male', man: 'male', mr: 'male', other: 'other', o: 'other' };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A date as centres type it: 2026-10-13, 13/10/2026 (day first, as in India and Europe), 13 Oct 2026. Null when it cannot be read. */
export function readDate(s: string): string | null {
  let y: number, m: number, d: number;
  let p: RegExpMatchArray | null;
  if ((p = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+p[1], +p[2], +p[3]];
  else if ((p = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) [d, m, y] = [+p[1], +p[2], +p[3]];
  else if ((p = s.match(/^(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s,-]+(\d{2}|\d{4})$/i)) && MONTHS.includes(p[2].toLowerCase())) [d, m, y] = [+p[1], MONTHS.indexOf(p[2].toLowerCase()) + 1, +p[3]];
  else return null;
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : null;
}

/** `today` is the centre's date (Settings.timezone), YYYY-MM-DD. */
export function checkResidentRows(text: string, today: string): { columns: Record<keyof typeof COLUMNS, boolean>; rows: CheckedRow[] } {
  const table = parseTable(text.replace(/^﻿/, ''));
  const header = table[0].map((h) => h.toLowerCase());
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, re]) => [k, header.findIndex((h) => re.test(h))])) as Record<keyof typeof COLUMNS, number>;
  // A paste without a header row is read as name, gender, arriving, leaving, phone.
  const headed = col.name >= 0;
  const at = headed ? col : { name: 0, gender: 1, arriving: 2, leaving: 3, phone: 4 };
  const cell = (r: string[], i: number) => (i >= 0 ? r[i] ?? '' : '');
  const rows: CheckedRow[] = [];
  table.forEach((r, i) => {
    if ((headed && i === 0) || r.every((c) => !c)) return;
    const name = cell(r, at.name), rawArriving = cell(r, at.arriving), rawLeaving = cell(r, at.leaving);
    const gender = GENDERS[cell(r, at.gender).toLowerCase().replace(/\./g, '')] ?? null;
    const arriving = rawArriving ? readDate(rawArriving) : null, leaving = rawLeaving ? readDate(rawLeaving) : null;
    const problems: RowProblem[] = [];
    if (!name) problems.push('no_name');
    if (!gender) problems.push('no_gender');
    if (!arriving || !leaving) problems.push('bad_date');
    else if (leaving < today) problems.push('leaving_past');
    const row = { line: i + 1, name, gender, arriving, leaving, phone: cell(r, at.phone), problems };
    if (!problems.length) {
      const check = patientSchema.safeParse({ name, gender, phone: row.phone || undefined, stay: { start_date: arriving, end_date: leaving } });
      if (!check.success) problems.push(check.error.issues.some((x) => x.path.includes('stay')) ? 'leaving_before_arriving' : 'invalid');
    }
    rows.push(row);
  });
  return { columns: Object.fromEntries(Object.entries(col).map(([k, v]) => [k, !headed || v >= 0])) as Record<keyof typeof COLUMNS, boolean>, rows };
}
