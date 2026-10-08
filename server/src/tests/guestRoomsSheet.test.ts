import assert from 'node:assert/strict';
import { buildGuestRoomsSheet } from '../pdf/guestRoomsSheetPdf.js';

const day = '2026-10-08'; // a Thursday
const g = (name: string, start_date: string, end_date: string) => ({ name, start_date, end_date });
const rooms = [
  { name: 'T1', beds: 1, type: 'Trishul House', guests: [g('Vivaan Iyer', '2026-10-01', '2026-10-14')] },
  { name: 'T2', beds: 2, type: 'Trishul House', guests: [g('Krishna Singh', '2026-10-01', '2026-10-12')] },
  { name: 'T3', beds: 1, type: 'Trishul House', guests: [g('Sneha Banerjee', '2026-10-01', '2026-10-08')] },
  { name: 'T4', beds: 1, type: 'Trishul House', guests: [g('Asha Rao', '2026-10-01', '2026-10-08'), g('Ishita Shah', '2026-10-08', '2026-10-28')] },
  { name: 'T5', beds: 1, type: 'Trishul House', guests: [g('Ishita Mehra', '2026-10-08', '2026-10-28')] },
  { name: 'T6', beds: 1, type: 'Trishul House', guests: [g('Gone Already', '2026-10-01', '2026-10-05')] },
  { name: 'A1', beds: 2, type: 'Trishul House', guests: [g('Nisha Iyer', '2026-10-01', '2026-10-12'), g('Meera Reddy', '2026-10-01', '2026-10-08')] },
  { name: 'N1', beds: 1, type: 'Nanda House', guests: [] },
];
const s = buildGuestRoomsSheet(rooms, day);
const by = Object.fromEntries(s.groups.flatMap((x) => x.rows).map((r) => [r.room, r]));

assert.equal(by.T1.kind, 'staying');
assert.equal(by.T1.line, 'Vivaan Iyer · until Wed 14 Oct');
assert.equal(by.T2.line, 'Krishna Singh · until Mon 12 Oct · 1 bed free');
assert.equal(by.T3.kind, 'leaving');
assert.equal(by.T3.line, 'Make up · Sneha Banerjee leaves today');
assert.equal(by.T4.kind, 'turnover');
assert.match(by.T4.line, /^Make up, then ready for Ishita Shah \(arrives today\)/);
assert.equal(by.T5.kind, 'arriving');
assert.equal(by.T6.kind, 'free');
assert.equal(by.N1.line, 'Free');
assert.equal(by.A1.kind, 'staying'); // one leaves, one stays: not a room to make up
assert.equal(by.A1.line, 'Nisha Iyer · until Mon 12 Oct · Meera Reddy leaves today · 1 bed free');
assert.deepEqual(s.counts, { rooms: 8, makeUp: 2, arriving: 2, staying: 3, free: 2 });
assert.deepEqual(s.first, ['T4']);
assert.deepEqual(s.groups.map((x) => x.type), ['Trishul House', 'Nanda House']);
// A centre with none.
assert.equal(buildGuestRoomsSheet([], day).counts.rooms, 0);
console.log('guest rooms sheet ok');
