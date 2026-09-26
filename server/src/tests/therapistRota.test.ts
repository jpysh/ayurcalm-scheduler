import assert from 'node:assert/strict';
import { buildRota } from '../pdf/therapistRotaPdf.js';

// A Wednesday.
const day = new Date('2026-09-16T00:00:00.000Z');

const base = {
  day,
  staff: [
    { id: 's1', name: 'Anjali Rao', is_active: true },
    { id: 's2', name: 'Kumar Nair', is_active: true },
    { id: 's3', name: 'Priya Menon', is_active: true },
    { id: 's4', name: 'Retired Therapist', is_active: false },
  ],
  appts: [
    { staff_id: 's2', patient_id: 'p1', therapy_id: 't1', room_id: 'r1', start_time: '10:00', duration_minutes: 60 },
    { staff_id: 's1', patient_id: 'p2', therapy_id: 't2', room_id: null, start_time: '09:00', duration_minutes: 45 },
  ],
  events: [
    { start_time: '07:30', end_time: '08:30', activity_name: 'Yoga', staff_id: 's3', staff_scope: 'custom', staff_ids: [] },
  ],
  timeOff: [] as any[],
  patientById: { p1: 'Sarah Smith', p2: 'Mike Johnson' },
  therapyById: { t1: 'Abhyanga', t2: 'Shirodhara' },
  roomById: { r1: 'Room 1' },
  openingTime: '09:00',
  closingTime: '18:00',
};

const off = (over: Record<string, unknown>) => ({
  entity_type: 'staff', entity_id: null, date: null, start_date: null, end_date: null,
  start_time: null, end_time: null, recurrence: null, weekdays: [], description: null, ...over,
} as any);

// Inactive staff are not on the rota at all, and the rest are alphabetical.
{
  const { rows } = buildRota(base);
  assert.deepEqual(rows.map((r) => r.name), ['Anjali Rao', 'Kumar Nair', 'Priya Menon']);
  assert.ok(rows.every((r) => r.available));
}

// A cell names the therapy, its length, the patient and the room.
{
  const { slots, rows } = buildRota(base);
  const kumar = rows.find((r) => r.name === 'Kumar Nair')!;
  const at10 = slots.findIndex((s) => s.start <= 600 && s.end > 600);
  assert.equal(kumar.cells[at10][0].text, 'Abhyanga 60m · Sarah Smith · Room 1');
  assert.equal(kumar.cells[at10][0].t, '10:00');
  assert.ok(kumar.cells[at10][0].bold, 'a treatment is bold');
  // A therapy with no room still prints what is known.
  const anjali = rows.find((r) => r.name === 'Anjali Rao')!;
  const at9 = slots.findIndex((s) => s.start <= 540 && s.end > 540);
  assert.equal(anjali.cells[at9][0].text, 'Shirodhara 45m · Mike Johnson');
}

// An event the therapist runs is on their row: that hour is not free.
{
  const { slots, rows } = buildRota(base);
  const priya = rows.find((r) => r.name === 'Priya Menon')!;
  const at730 = slots.findIndex((s) => s.start <= 450 && s.end > 450);
  assert.equal(priya.cells[at730][0].text, 'Yoga 60m');
  assert.equal(priya.cells[at730][0].bold, false, 'an event is not a treatment');
}

// A full-day absence moves the therapist to the unavailable group, with the
// reason, and takes their cells with them. (Priya has an event, no treatment;
// a treatment still booked with them is the #134 case below.)
{
  const { rows } = buildRota({ ...base, timeOff: [off({ entity_id: 's3', date: day, description: 'Sick leave' })] });
  assert.deepEqual(rows.map((r) => r.name), ['Anjali Rao', 'Kumar Nair', 'Priya Menon']);
  const priya = rows[2];
  assert.equal(priya.available, false);
  assert.equal(priya.note, 'Sick leave');
  assert.ok(priya.cells.every((c) => c.length === 0));
}

// A part-day absence keeps them working, greying only the hours it covers.
{
  const { slots, rows } = buildRota({
    ...base,
    timeOff: [off({ entity_id: 's2', date: day, start_time: '14:00', end_time: '17:00', description: 'Dentist' })],
  });
  const kumar = rows.find((r) => r.name === 'Kumar Nair')!;
  assert.equal(kumar.available, true, 'part of a day off is still on shift');
  const at10 = slots.findIndex((s) => s.start <= 600 && s.end > 600);
  assert.ok(kumar.cells[at10].some((l) => l.bold), 'the morning treatment survives');
  // The absence shows in every column it overlaps, and each one states the
  // hours and the reason rather than leaving a wide column to be guessed at.
  const greyed = kumar.cells.filter((c) => c.some((l) => l.grey));
  assert.equal(greyed.length, 2, '14:00-17:00 spans the afternoon and the evening');
  assert.ok(greyed.every((c) => c.some((l) => l.text === 'Not available 14:00–17:00 — Dentist')));
}

// A weekly recurring absence lands on its weekday.
{
  const { rows } = buildRota({ ...base, timeOff: [off({ entity_id: 's3', recurrence: 'weekly', weekdays: ['wednesday'], description: 'Weekly off' })] });
  assert.equal(rows.find((r) => r.name === 'Priya Menon')!.available, false);
  const other = buildRota({ ...base, timeOff: [off({ entity_id: 's3', recurrence: 'weekly', weekdays: ['monday'], description: 'Weekly off' })] });
  assert.equal(other.rows.find((r) => r.name === 'Priya Menon')!.available, true);
}

// Asked for one therapist, the rota is only that therapist.
{
  const { rows } = buildRota({ ...base, onlyStaffId: 's2' });
  assert.deepEqual(rows.map((r) => r.name), ['Kumar Nair']);
}

// Always the same three columns, however much is booked.
{
  const many = Array.from({ length: 9 }, (_, i) => ({
    staff_id: 's1', patient_id: 'p1', therapy_id: 't1', room_id: 'r1',
    start_time: `${String(8 + i).padStart(2, '0')}:00`, duration_minutes: 60,
  }));
  const { slots } = buildRota({ ...base, appts: many, events: [] });
  assert.deepEqual(slots.map((s) => s.label.split(' ')[0]), ['Morning', 'Afternoon', 'Evening']);
  assert.deepEqual([slots[0].end, slots[1].start, slots[1].end, slots[2].start], [720, 720, 960, 960]);
}

// The outer edges stretch to whatever the day actually holds, so a 07:30 class
// and a treatment running past closing both have a column to sit in.
{
  const { slots } = buildRota(base);
  assert.equal(slots[0].start, 450, 'morning opens at the 07:30 yoga, not at 09:00');
  assert.equal(slots[2].end, 18 * 60, 'evening runs to closing when nothing is later');
  const late = buildRota({
    ...base,
    appts: [{ staff_id: 's1', patient_id: 'p1', therapy_id: 't1', room_id: 'r1', start_time: '19:00', duration_minutes: 90 }],
  });
  assert.equal(late.slots[2].end, 20 * 60 + 30, 'evening stretches to the last treatment');
}

// A treatment worked by two is on both therapists' rows, each saying who the
// other one is, under the treatment it belongs to.
{
  const { rows, slots } = buildRota({
    ...base,
    appts: [{ staff_id: 's2', co_staff_ids: ['s3'], patient_id: 'p1', therapy_id: 't1', room_id: 'r1', start_time: '10:00', duration_minutes: 60 }],
    events: [],
  });
  const at10 = slots.findIndex((s) => s.start <= 600 && s.end > 600);
  const cell = (name: string) => rows.find((r) => r.name === name)!.cells[at10].map((l) => l.text);
  assert.deepEqual(cell('Kumar Nair'), ['Abhyanga 60m · Sarah Smith · Room 1', 'with Priya Menon']);
  assert.deepEqual(cell('Priya Menon'), ['Abhyanga 60m · Sarah Smith · Room 1', 'with Kumar Nair']);
}

console.log('therapistRota: ok');

// Booked time counts assisting the same as leading, plus events; absent shows nothing.
{
  const { rows } = buildRota({
    ...base,
    appts: [...base.appts, { staff_id: 's2', co_staff_ids: ['s3'], patient_id: 'p1', therapy_id: 't1', room_id: 'r1', start_time: '14:00', duration_minutes: 105 }],
    timeOff: [off({ entity_id: 's1', date: day, description: 'Sick leave' })],
  });
  const by = (n: string) => rows.find((r) => r.name === n)!;
  assert.equal(by('Kumar Nair').note, '2h 45m');
  assert.equal(by('Priya Menon').note, '2h 45m', 'assisting 105m + yoga 60m');
  assert.equal(by('Anjali Rao').note, 'Off — Sick leave', 'still booked, so marked (#134)');
}

// A treatment running into an event counts the shared half hour once.
{
  const { rows } = buildRota({
    ...base,
    appts: [{ staff_id: 's3', patient_id: 'p1', therapy_id: 't1', room_id: null, start_time: '08:00', duration_minutes: 60 }],
  });
  assert.equal(rows.find((r) => r.name === 'Priya Menon')!.note, '1h 30m', 'yoga 07:30-08:30 + 08:00-09:00');
}

// #134: a treatment still booked with someone off for the whole day is not
// dropped. It prints on their row, marked, and that row leads the sheet.
{
  const { slots, rows } = buildRota({ ...base, timeOff: [off({ entity_id: 's2', date: day, description: 'Leave' })] });
  assert.equal(rows[0].name, 'Kumar Nair');
  assert.ok(rows[0].unstaffed && !rows[0].available);
  assert.equal(rows[0].note, 'Off — Leave');
  const at10 = slots.findIndex((s) => s.start <= 600 && s.end > 600);
  assert.equal(rows[0].cells[at10][0].text, 'NO THERAPIST · Abhyanga 60m · Sarah Smith · Room 1');
}
