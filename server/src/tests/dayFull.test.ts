/**
 * A day with no therapist free for an hour says so, and from when (#979).
 * Pure: a hand-built day, no database. A fixed Wednesday in 2030.
 */
import assert from 'node:assert/strict';
import { fullFrom, type DayContext } from '../appointmentGuard.js';

const week = Object.fromEntries(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]));
const staff = [
  { id: 'a', role: 'therapist', is_active: true, weekly_schedule: week },
  { id: 'b', role: 'therapist', is_active: true, weekly_schedule: { ...week, wednesday: { start: '09:00', end: '15:00' } } },
  { id: 'doc', role: 'doctor', is_active: true, weekly_schedule: week },
];
const appt = (staff_id: string, start_time: string, duration_minutes: number) => ({ id: `${staff_id}${start_time}`, staff_id, co_therapist_ids: [], start_time, duration_minutes });
const day = (appointments: ReturnType<typeof appt>[]) => ({
  day: new Date('2030-08-14T00:00:00.000Z'), appointments, timeOff: [], events: [], staff, rooms: [], patients: [], therapies: [],
  settings: { opening_time: '09:00', closing_time: '18:00', timezone: 'Asia/Kolkata', closed_weekdays: [] },
}) as unknown as DayContext;

assert.equal(fullFrom(day([])), null, 'an empty day is not full');
assert.equal(fullFrom(day([appt('a', '09:00', 540), appt('b', '09:00', 360)])), '09:00', 'booked solid is full all day');
// a is booked from 12:00 to closing; b goes home at 15:00 and is booked 11:30-15:00. The doctor's free time does not count.
const full = fullFrom(day([appt('a', '12:00', 360), appt('b', '11:30', 210)]));
assert.equal(full, '12:00');
// One free hour at 16:00 for a: not full.
assert.equal(fullFrom(day([appt('a', '09:00', 420), appt('a', '17:00', 60), appt('b', '09:00', 360)])), null);
console.log('PASS dayFull');
