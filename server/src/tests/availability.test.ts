import assert from 'node:assert/strict';
import { activeEventsOnDay, eventAppliesToStaff, eventBlocking, staffEventBusy, type EventRow } from '../availability.js';

const monday = new Date('2026-09-14T00:00:00.000Z');
const wednesday = new Date('2026-09-16T00:00:00.000Z');
const everyDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const event = (over: Partial<EventRow>): EventRow => ({
  date: null, start_date: null, end_date: null,
  start_time: '07:00', end_time: '08:00', activity_name: 'Yoga',
  recurrence: 'weekly', weekdays: everyDay,
  staff_id: null, staff_scope: 'none', staff_ids: [],
  ...over,
});

// Who an event ties up.
{
  const custom = event({ staff_scope: 'custom', staff_ids: ['s1'] });
  assert.ok(eventAppliesToStaff(custom, 's1'));
  assert.ok(!eventAppliesToStaff(custom, 's2'));

  assert.ok(eventAppliesToStaff(event({ staff_scope: 'all' }), 's2'));
  assert.ok(!eventAppliesToStaff(event({ staff_scope: 'none' }), 's1'));

  // Events predate staff_scope; a bare staff_id still means that person is on it.
  assert.ok(eventAppliesToStaff(event({ staff_scope: null, staff_id: 's3' }), 's3'));
}

// A therapist running a recurring weekly class is busy for those hours.
{
  const events = [event({ staff_scope: 'custom', staff_ids: ['s1'] })];
  assert.deepEqual(staffEventBusy(events, 's1', wednesday), [{ s: 420, e: 480, label: 'Yoga' }]);
  assert.deepEqual(staffEventBusy(events, 's2', wednesday), []);

  // Overlapping the class is blocked; butting up against it is not.
  assert.ok(eventBlocking(events, 's1', wednesday, 450, 540));
  assert.ok(!eventBlocking(events, 's1', wednesday, 480, 540));
}

// A weekday-specific event replaces the daily one it runs over, so the centre
// does not hold the morning prayer on the Monday the havan covers it.
{
  const prayer = event({ activity_name: 'Morning Prayer Meditation', start_time: '08:30', end_time: '09:00', staff_scope: 'custom', staff_ids: ['s1'] });
  const havan = event({ activity_name: 'Temple Havan Ritual', start_time: '08:30', end_time: '09:30', weekdays: ['monday'], staff_scope: 'custom', staff_ids: ['s1'] });

  assert.deepEqual(activeEventsOnDay([prayer, havan], monday).map((e) => e.activity_name), ['Temple Havan Ritual']);
  assert.deepEqual(activeEventsOnDay([prayer, havan], wednesday).map((e) => e.activity_name), ['Morning Prayer Meditation']);

  // On Monday the therapist is tied up until the havan ends, not the prayer.
  assert.deepEqual(staffEventBusy([prayer, havan], 's1', monday), [{ s: 510, e: 570, label: 'Temple Havan Ritual' }]);

  // A one-off beats a weekly event of any shape.
  const special = event({ recurrence: null, weekdays: [], date: monday, activity_name: 'Special Session', start_time: '08:30', end_time: '09:30' });
  assert.deepEqual(activeEventsOnDay([prayer, havan, special], monday).map((e) => e.activity_name), ['Special Session']);
}

// Events that do not overlap in time both stand, however specific they are.
{
  const daily = event({ activity_name: 'Evening Yoga', start_time: '17:00', end_time: '18:00' });
  const mondayOnly = event({ activity_name: 'Satsang', start_time: '19:00', end_time: '20:00', weekdays: ['monday'] });
  assert.equal(activeEventsOnDay([daily, mondayOnly], monday).length, 2);
}

console.log('availability tests passed');
