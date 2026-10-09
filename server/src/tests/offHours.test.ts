import assert from 'node:assert/strict';
import { findConflict, staffDay, type DayContext } from '../appointmentGuard.js';
import { outsideHours } from '../availability.js';

// A fixed day far from the seed, as every dated test here does.
const day = new Date('2030-03-13T00:00:00.000Z');

const off = (over: Record<string, unknown>) => ({
  id: String(Math.random()), entity_type: 'staff', entity_id: null, date: day, start_date: null, end_date: null,
  start_time: null, end_time: null, description: null, ...over,
});

const ctx = (timeOff: unknown[]) => ({
  day,
  appointments: [],
  timeOff,
  events: [],
  staff: [{ id: 's1', name: 'Asha', is_active: true, gender: 'female', specializations: [] }],
  rooms: [{ id: 'r1', name: 'Room 1', amenities: [] }],
  settings: null,
  patients: [{ id: 'p1', name: 'Resident', gender: 'female' }],
  therapies: [],
}) as unknown as DayContext;

const at = (start_time: string) => ({ scheduled_date: day, start_time, duration_minutes: 60, staff_id: 's1', room_id: 'r1', patient_id: 'p1' });

// A therapist two hours late is refused for the morning and free after.
{
  const late = ctx([off({ entity_id: 's1', start_time: '09:00', end_time: '11:00', description: 'Running late' })]);
  assert.equal(findConflict(at('10:00'), late)?.reason, 'STAFF_OFF');
  assert.equal(findConflict(at('10:00'), late)?.message, 'Asha is not in from 09:00 to 11:00 (Running late).');
  assert.equal(findConflict(at('11:00'), late), null, 'free once the hours end');
  const [asha] = staffDay(late);
  assert.equal(asha.off, null, 'part-day leave is not a day off');
  assert.deepEqual(asha.busy.map((b) => [b.s, b.e]), [[540, 660]]);
}

// Time off with no hours still takes the whole day.
assert.equal(findConflict(at('16:00'), ctx([off({ entity_id: 's1', description: 'Sick' })]))?.message, 'Asha is not in on this day (Sick).');

// A room out of use is refused in those hours only.
{
  const heater = ctx([off({ entity_type: 'room', entity_id: 'r1', start_time: '12:00', end_time: '14:00', description: 'Heater broken' })]);
  assert.equal(findConflict(at('13:00'), heater)?.reason, 'ROOM_OFF');
  assert.equal(findConflict(at('13:00'), heater)?.message, 'Room 1 is out of use from 12:00 to 14:00 (Heater broken).');
  assert.equal(findConflict(at('10:00'), heater), null);
}

console.log('offHours: ok');

// Weekly hours (#351): outside them, or on a day off, is refused as leave is; a pattern never set limits nothing.
{
  const withHours = (weekly_schedule: unknown) => ({ ...ctx([]), staff: [{ id: 's1', name: 'Asha', is_active: true, gender: 'female', specializations: [], weekly_schedule }] }) as unknown as DayContext;
  const early = withHours({ wednesday: { start: '07:00', end: '15:00' } });
  assert.equal(findConflict(at('07:00'), early), null, 'in their hours');
  assert.equal(findConflict(at('14:30'), early)?.message, 'Asha works 07:00 to 15:00.');
  assert.deepEqual(staffDay(early)[0].busy.map((b) => [b.s, b.e]), [[0, 420], [900, 1440]]);
  const wedOff = withHours({ monday: { start: '09:00', end: '18:00' }, wednesday: null });
  assert.equal(findConflict(at('10:00'), wedOff)?.message, 'Asha does not work on Wednesdays.');
  assert.equal(staffDay(wedOff)[0].off, 'Day off');
  assert.equal(findConflict(at('20:00'), withHours({})), null, 'never set: no limit');
}
console.log('offHours weekly: ok');

// Changing hours (#380): what would fall outside is named before the save.
{
  const booked = [at('08:00'), at('14:30'), { ...at('10:00'), scheduled_date: new Date('2030-03-14T00:00:00.000Z') }];
  const early = { wednesday: { start: '07:00', end: '15:00' }, thursday: null };
  assert.deepEqual(outsideHours(early, booked).map((a) => a.start_time), ['14:30', '10:00'], 'runs past 15:00, and a day off');
  assert.deepEqual(outsideHours({}, booked), [], 'never set: nothing outside');
}
console.log('offHours change: ok');

// The centre shut (#393): a weekday unticked in Opening hours, or a centre closed day, refuses every booking.
{
  const open = (working_days: string[], timeOff: unknown[] = []) => ({ ...ctx(timeOff), settings: { working_days } }) as unknown as DayContext;
  const all = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  assert.equal(findConflict(at('10:00'), open(all)), null, 'open every day');
  assert.equal(findConflict(at('10:00'), open(all.filter((d) => d !== 'wednesday')))?.message, 'The centre is closed on Wednesdays.');
  assert.equal(findConflict(at('10:00'), open(all, [off({ entity_type: 'center', description: 'Holi' })]))?.reason, 'CENTER_HOLIDAY');
  assert.equal(findConflict(at('10:00'), open(all, [off({ entity_type: 'center', description: 'Holi' })]))?.message, 'The centre is closed for Holi.');
  assert.equal(findConflict(at('10:00'), ctx([])), null, 'no settings yet: open');
}
