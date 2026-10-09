import assert from 'node:assert/strict';
import { buildGuestRoomsSheet } from '../pdf/guestRoomsSheetPdf.js';
import { outNight } from '../guestRooms.js';

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
  { name: 'A2', beds: 2, type: 'Trishul House', guests: [g('Meera Patel', '2026-10-01', '2026-10-18'), g('Meera Iyer', '2026-10-01', '2026-10-11')] },
  { name: 'A3', beds: 2, type: 'Trishul House', guests: [g('Diya Yadav', '2026-10-01', '2026-10-12'), g('Arjun Das', '2026-10-08', '2026-10-15')] },
  { name: 'N1', beds: 1, type: 'Nanda House', guests: [] },
  { name: 'N2', beds: 1, type: 'Nanda House', guests: [], out: { reason: 'No electricity' } },
  { name: 'N3', beds: 1, type: 'Nanda House', guests: [g('Rohan Das', '2026-10-01', '2026-10-14')], out: { reason: 'Leak' } },
  { name: 'N4', beds: 2, type: 'Nanda House', guests: [g('Tara Bose', '2026-10-01', '2026-10-14')], out: { reason: null } },
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
// A shared room gives each guest their own leaving date, and an arrival into it is a bed to ready (#660).
assert.equal(by.A2.line, 'Meera Patel until Sun 18 Oct, Meera Iyer until Sun 11 Oct');
assert.equal(by.A3.line, 'Diya Yadav · until Mon 12 Oct · ready a bed for Arjun Das (arrives today) · until Thu 15 Oct');
assert.equal(by.N2.kind, 'out');
assert.equal(by.N2.line, 'Out of use: No electricity');
assert.equal(by.N3.line, 'Rohan Das · until Wed 14 Oct · out of use: Leak, needs another room');
assert.equal(by.N4.line, 'Tara Bose · until Wed 14 Oct · out of use, needs another room'); // no spare bed in a room nobody may sleep in (#624)
assert.deepEqual(s.counts, { rooms: 13, makeUp: 3, arriving: 3, staying: 7, free: 2, out: 1 });
assert.deepEqual(s.first, ['T4']);
assert.deepEqual(s.groups.map((x) => x.type), ['Trishul House', 'Nanda House']);

// Out of use is the whole days from the first to the last, both included; the first such night in the asked nights wins.
const offRow = (start: string, end: string, why: string | null) => ({ entity_id: 'r1', date: null, start_date: new Date(`${start}T00:00:00Z`), end_date: new Date(`${end}T00:00:00Z`), description: why });
const d = (x: string) => new Date(`${x}T00:00:00Z`);
assert.deepEqual(outNight([offRow('2026-10-09', '2026-10-10', 'No electricity')], 'r1', d('2026-10-08'), d('2026-10-12')), { date: '2026-10-09', until: '2026-10-10', reason: 'No electricity' });
assert.equal(outNight([offRow('2026-10-09', '2026-10-10', null)], 'r1', d('2026-10-10'), d('2026-10-11'))?.date, '2026-10-10'); // the last day is still out
assert.equal(outNight([offRow('2026-10-09', '2026-10-10', null)], 'r1', d('2026-10-11'), d('2026-10-14')), null); // free again from the next day
assert.equal(outNight([offRow('2026-10-09', '2026-10-10', null)], 'r2', d('2026-10-09'), d('2026-10-10')), null); // another room
// A centre with none.
assert.equal(buildGuestRoomsSheet([], day).counts.rooms, 0);
console.log('guest rooms sheet ok');
