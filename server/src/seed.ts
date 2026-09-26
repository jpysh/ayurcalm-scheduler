import 'dotenv/config';
import { ensureStarterDietTemplates } from './dietTemplateSeed.js';
import { PrismaClient } from '@prisma/client';
import { staffEventBusy } from './availability.js';
import bcrypt from 'bcrypt';
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } from './auth.js';

const prisma = new PrismaClient();

const ayurvedaRoomNames = [
  'Dhanvantari', 'Nasatya', 'Dasra', 'Shiva', 'Vishnu', 'Lakshmi', 'Parvati', 'Ganesha',
  'Hanuman', 'Saraswati', 'Surya', 'Chandra', 'Agni', 'Vayu', 'Indra', 'Varuna', 'Kubera', 'Yama', 'Brahma', 'Narada'
];

const amenitiesSet = ['massage_table','shower','steam','herbal_oil','shirodhara_stand','dhara_stand','rice_boluses','herbal_paste'];

const therapyDefs = [
  { name: 'Abhyanga', req: ['massage_table','herbal_oil'], dur: 60, gender: false },
  { name: 'Shirodhara', req: ['shirodhara_stand','massage_table'], dur: 90, gender: true },
  { name: 'Panchakarma', req: ['steam','massage_table','shower'], dur: 120, gender: true },
  { name: 'Nasya', req: ['massage_table'], dur: 45, gender: false },
  // Worked by two therapists at once, one each side of the resident.
  { name: 'Pizhichil', req: ['massage_table','shower'], dur: 75, gender: true, staff: 2 },
  { name: 'Udvartana', req: ['massage_table','herbal_paste'], dur: 60, gender: false },
  { name: 'Njavarakizhi', req: ['massage_table','rice_boluses'], dur: 90, gender: true, staff: 2 },
  { name: 'Kizhi', req: ['massage_table','rice_boluses'], dur: 60, gender: false },
  { name: 'Takradhara', req: ['dhara_stand','massage_table'], dur: 60, gender: true },
  { name: 'Padabhyanga', req: ['massage_table','herbal_oil'], dur: 45, gender: false },
  { name: 'Mukha Lepam', req: ['herbal_paste'], dur: 45, gender: false },
  { name: 'Karna Poorna', req: ['herbal_oil'], dur: 30, gender: false },
  { name: 'Netra Tarpana', req: ['herbal_paste'], dur: 30, gender: false },
  { name: 'Kativasti', req: ['herbal_paste','massage_table'], dur: 45, gender: false },
  { name: 'Greeva Vasti', req: ['herbal_paste','massage_table'], dur: 45, gender: false },
  { name: 'Janu Vasti', req: ['herbal_paste','massage_table'], dur: 45, gender: false },
  { name: 'Uro Vasti', req: ['herbal_paste','massage_table'], dur: 45, gender: false },
  { name: 'Dhanyamladhara', req: ['dhara_stand','massage_table'], dur: 60, gender: false },
  { name: 'Basti Therapy', req: ['massage_table'], dur: 30, gender: false },
  { name: 'Snehana', req: ['herbal_oil','massage_table'], dur: 60, gender: false },
  { name: 'Marma Therapy', req: ['massage_table'], dur: 60, gender: false },
  { name: 'Kaya Seka', req: ['massage_table','herbal_oil'], dur: 75, gender: false },
  { name: 'Pinda Sweda', req: ['massage_table','rice_boluses'], dur: 60, gender: false },
  { name: 'Chakra Basti', req: ['herbal_paste','massage_table'], dur: 45, gender: false },
  { name: 'Hridaya Basti', req: ['herbal_paste','massage_table'], dur: 45, gender: false },
  { name: 'Nabhi Basti', req: ['herbal_paste','massage_table'], dur: 45, gender: false },
  { name: 'Agnikarma', req: ['herbal_oil'], dur: 30, gender: false },
  { name: 'Patra Pinda Sweda', req: ['massage_table','rice_boluses'], dur: 60, gender: false },
  { name: 'Shiro Abhyanga', req: ['massage_table','herbal_oil'], dur: 45, gender: false },
  { name: 'Nasyam', req: ['massage_table'], dur: 30, gender: false },
  { name: 'Gandusha', req: ['herbal_oil'], dur: 20, gender: false },
  { name: 'Kavala', req: ['herbal_oil'], dur: 20, gender: false },
  { name: 'Lepam', req: ['herbal_paste'], dur: 40, gender: false },
  { name: 'Anna Lepam', req: ['herbal_paste'], dur: 40, gender: false },
  { name: 'Udvartanam', req: ['massage_table','herbal_paste'], dur: 60, gender: false },
  { name: 'Thalapothichil', req: ['herbal_paste'], dur: 60, gender: false },
  { name: 'Sirovasti', req: ['shirodhara_stand'], dur: 60, gender: true },
  { name: 'Ksheeradhara', req: ['dhara_stand'], dur: 60, gender: false },
  { name: 'Jambira Pinda Sweda', req: ['massage_table','rice_boluses'], dur: 60, gender: false },
  { name: 'Avagaha Sweda', req: ['steam'], dur: 45, gender: false },
  { name: 'Tarpana', req: ['herbal_paste'], dur: 30, gender: false },
  { name: 'Netra Basti', req: ['herbal_paste'], dur: 30, gender: false },
  { name: 'Ardha Abhyanga', req: ['massage_table','herbal_oil'], dur: 40, gender: false },
  { name: 'Pada Kizhi', req: ['massage_table','rice_boluses'], dur: 45, gender: false },
  { name: 'Spinal Basti', req: ['herbal_paste','massage_table'], dur: 45, gender: false },
  { name: 'Udaravasti', req: ['herbal_paste','massage_table'], dur: 45, gender: false },
  { name: 'Nadi Sweda', req: ['steam'], dur: 30, gender: false },
  { name: 'Bhasti', req: ['massage_table'], dur: 30, gender: false },
  { name: 'Talam', req: ['herbal_paste'], dur: 30, gender: false },
  { name: 'Pizhichil Deluxe', req: ['massage_table','shower'], dur: 90, gender: true },
];

/**
 * Rest for the patient and cleanup for the room after a therapy, derived from
 * what the therapy needs rather than listed per therapy: steam and oil are what
 * make a room take time to turn round and a patient take time to get up.
 * Panchakarma centres commonly allow half an hour after swedana or a full-body
 * oil therapy, and the room needs wiping down before the next oil treatment.
 * A centre tunes these per therapy in the Therapies tab; these are the defaults
 * a fresh install starts from.
 */
const cleaningFor = (req: string[]) => {
  if (req.includes('steam') || req.includes('shower')) return 30;
  if (req.includes('herbal_oil') || req.includes('dhara_stand') || req.includes('shirodhara_stand')) return 20;
  if (req.includes('rice_boluses') || req.includes('herbal_paste')) return 15;
  return 10;
};

const indianHolidays2025 = [
  { date: '2025-01-26', desc: 'Republic Day' },
  { date: '2025-03-14', desc: 'Holi' },
  { date: '2025-03-31', desc: 'Ram Navami' },
  { date: '2025-04-06', desc: 'Mahavir Jayanti' },
  { date: '2025-04-14', desc: 'Ambedkar Jayanti' },
  { date: '2025-04-18', desc: 'Good Friday' },
  { date: '2025-05-01', desc: 'Maharashtra Day' },
  { date: '2025-06-08', desc: 'Eid al-Adha' },
  { date: '2025-08-15', desc: 'Independence Day' },
  { date: '2025-09-05', desc: 'Teacher’s Day' },
  { date: '2025-10-02', desc: 'Gandhi Jayanti' },
  { date: '2025-10-21', desc: 'Dussehra' },
  { date: '2025-10-31', desc: 'Govardhan Puja' },
  { date: '2025-11-01', desc: 'Bhai Dooj' },
  { date: '2025-11-14', desc: 'Children’s Day' },
  { date: '2025-11-15', desc: 'Diwali' },
  { date: '2025-11-16', desc: 'Diwali Holiday' },
  { date: '2025-12-25', desc: 'Christmas Day' },
  { date: '2025-08-19', desc: 'Raksha Bandhan' },
  { date: '2025-07-29', desc: 'Muharram' },
];

const indianHolidays2026 = [
  { date: '2026-01-26', desc: 'Republic Day' },
  { date: '2026-03-04', desc: 'Holi' },
  { date: '2026-03-17', desc: 'Ram Navami' },
  { date: '2026-04-09', desc: 'Mahavir Jayanti' },
  { date: '2026-04-14', desc: 'Ambedkar Jayanti' },
  { date: '2026-04-03', desc: 'Good Friday' },
  { date: '2026-05-01', desc: 'Maharashtra Day' },
  { date: '2026-06-27', desc: 'Eid al-Adha' },
  { date: '2026-08-15', desc: 'Independence Day' },
  { date: '2026-09-05', desc: 'Teacher’s Day' },
  { date: '2026-10-02', desc: 'Gandhi Jayanti' },
  { date: '2026-10-11', desc: 'Dussehra' },
  { date: '2026-11-09', desc: 'Diwali' },
  { date: '2026-11-10', desc: 'Diwali Holiday' },
  { date: '2026-12-25', desc: 'Christmas Day' },
  { date: '2026-08-28', desc: 'Raksha Bandhan' },
  { date: '2026-07-19', desc: 'Muharram' },
];

// The demo data is a fixture, not a lottery: everyone who clones this repo gets
// the same centre, and the scheduling invariant test can assert on it. Seeded
// PRNG rather than Math.random for that reason.
let rngState = 0x9e3779b9;
function random() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randomOf<T>(arr: T[]) { return arr[Math.floor(random() * arr.length)]; }
function toMinutes(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function overlaps(aS: number, aE: number, bS: number, bE: number) { return Math.max(aS, bS) < Math.min(aE, bE); }



// The centre's day, not the server's. Everything the app shows — the schedule,
// the warnings, the day sheet — is worked out in the centre's timezone, so a
// seed built on the UTC day puts today's absence on yesterday whenever the two
// disagree, and the demo opens with the problem it exists to show missing.
const CENTRE_TZ = process.env.ADMIN_TZ || 'Asia/Kolkata';
const centreYmd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: CENTRE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const centreToday = () => new Date(`${centreYmd(new Date())}T00:00:00.000Z`);

async function main() {
  const existingCounts = await Promise.all([
    prisma.patient.count(),
    prisma.staff.count(),
    prisma.therapy.count(),
    prisma.therapyRoom.count(),
    prisma.appointment.count(),
    prisma.timeOff.count(),
    prisma.programEvent.count(),
  ]);
  const totalExisting = existingCounts.reduce((a, b) => a + b, 0);
  if (totalExisting > 0) {
    console.warn('Seed aborted: existing data found');
    return;
  }

  const patients: string[] = [];
  const surnames = ['Sharma','Verma','Iyer','Nair','Reddy','Patel','Singh','Gupta','Joshi','Chatterjee','Das','Banerjee','Mishra','Yadav','Khan'];
  const firstNames = ['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Krishna','Ananya','Diya','Aarohi','Ishita','Sneha','Riya','Nisha','Meera'];
  // Every name distinct: two "Riya Das" rows on the day sheet read as a mistake.
  for (let i = 0; i < 120; i++) patients.push(`${firstNames[i % 15]} ${surnames[Math.floor(i / 15)]}`);
  // One name long enough to be shortened on the day sheet, as some real ones are.
  patients[7] = 'Venkatasubramanian Raghunathan';

  const createdPatients = await Promise.all(patients.map((name, idx) => prisma.patient.create({
    data: { name, gender: idx % 2 === 0 ? 'male' : 'female', phone: `+91-9${Math.floor(100000000 + random()*899999999)}` },
  })));

  const therapies = await Promise.all(therapyDefs.map(t => prisma.therapy.create({
    // One number per therapy: hands-on time plus the room's cleaning time, which
    // is what the day sheet prints and what the slot actually costs.
    data: { name: t.name, required_amenities: t.req, duration_minutes: t.dur + cleaningFor(t.req), requires_gender_match: t.gender, staff_required: (t as { staff?: number }).staff ?? 1 },
  })));

  const scheduleStd = { sunday: { start: '09:00', end: '20:00' }, monday: { start: '09:00', end: '20:00' }, tuesday: { start: '09:00', end: '20:00' }, wednesday: { start: '09:00', end: '20:00' }, thursday: { start: '09:00', end: '20:00' }, friday: { start: '09:00', end: '20:00' }, saturday: { start: '09:00', end: '20:00' } };

  // Every other room is fully equipped; with only the first four amenities
  // everywhere, dhara, kizhi and lepam therapies could never be booked.
  const rooms = await Promise.all(ayurvedaRoomNames.map((rn, idx) => prisma.therapyRoom.create({
    data: { name: rn, amenities: idx % 2 ? amenitiesSet : amenitiesSet.slice(0, 4), weekly_schedule: scheduleStd, is_active: true },
  })));

  // Therapists, not physicians. The 'Dr.' the seed used to carry was wrong for
  // most of them and made every rota column a word narrower.
  const staffNames = ['Priya','Raj','Anjali','Kumar','Neha','Ravi','Asha','Suresh','Meera','Arvind','Pooja','Kiran','Alok','Varsha','Manish','Bhavna','Rohit','Trisha','Dev','Kriti'];
  const staff = await Promise.all(staffNames.map((n, idx) => prisma.staff.create({
    data: {
      name: `${n} ${randomOf(surnames)}`,
      gender: idx % 2 === 0 ? 'female' : 'male',
      phone: `+91-8${Math.floor(100000000 + random()*899999999)}`,
      specializations: therapies.filter((_, j) => j % (idx % 3 + 2) === 0).map(t => t.id),
      weekly_schedule: scheduleStd,
      is_active: true,
    },
  })));

  for (const h of indianHolidays2025) {
    await prisma.timeOff.create({ data: { entity_type: 'center', date: new Date(h.date), description: h.desc } });
  }
  for (const h of indianHolidays2026) {
    await prisma.timeOff.create({ data: { entity_type: 'center', date: new Date(h.date), description: h.desc } });
  }
  // staff holidays (5 random business days within next 3 months per staff)
  const startRange = centreToday();
  const endRange = new Date(startRange);
  endRange.setMonth(endRange.getMonth() + 3);
  function isBusinessDay(d: Date) { const day = d.getDay(); return day >= 1 && day <= 5; }
  // Today always has one therapist off, weekend or not: the absence and its
  // reassignment are what the seeded day exists to show, and leave drawn only
  // from weekdays left every Saturday and Sunday without it.
  const onLeaveToday = staff[staff.length - 1];
  await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: onLeaveToday.id, date: new Date(centreYmd(startRange)), description: 'Personal Leave' } });
  for (const s of staff) {
    let count = 0;
    const used: Set<string> = new Set(s.id === onLeaveToday.id ? [centreYmd(startRange)] : []);
    while (count < 5) {
      const d = new Date(startRange);
      d.setDate(d.getDate() + Math.floor(random() * 90));
      const key = centreYmd(d);
      if (!isBusinessDay(d) || used.has(key)) continue;
      used.add(key);
      // Midnight of the day, as the scheduler matches it; the time of day the seed
      // happened to run made this leave invisible to booking.
      await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: s.id, date: new Date(key), description: 'Personal Leave' } });
      count++;
    }
  }

  // Program Events — the centre's day. Classes and prayers are optional: a
  // resident may be treated during one. Meals are not, and the day sheet prints
  // them in the resident's own column.
  //
  // Yoga and the meditations have a therapist on them, which is the point: that
  // person is genuinely unbookable for those hours, and the rota says why.
  const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const offTodayIds = new Set((await prisma.timeOff.findMany({ where: { entity_type: 'staff', date: centreToday() } })).map((h) => h.entity_id));
  const yogaStaff = staff.find((s) => s.gender === 'female' && !offTodayIds.has(s.id)) || staff[0];
  const prayerStaff = staff.find((s) => s.id !== yogaStaff.id && !offTodayIds.has(s.id)) || staff[1];
  const event = (over: Record<string, unknown>) => prisma.programEvent.create({ data: {
    recurrence: 'weekly', weekdays, room_id: null, staff_id: null, required_amenities: [],
    notes: '', audience: 'all', patients_scope: 'all', staff_scope: 'none', staff_ids: [],
    is_optional: false, start_time: '00:00', end_time: '00:00', activity_name: '',
    ...over,
  } as any });

  await event({ start_time: '07:00', end_time: '08:00', activity_name: 'Morning Yoga', is_optional: true, staff_scope: 'custom', staff_ids: [yogaStaff.id], staff_id: yogaStaff.id });
  await event({ start_time: '08:30', end_time: '09:00', activity_name: 'Morning Prayer Meditation', is_optional: true, staff_scope: 'custom', staff_ids: [prayerStaff.id], staff_id: prayerStaff.id });
  await event({ start_time: '08:00', end_time: '12:00', activity_name: 'Breakfast', notes: 'Diet per plan' });
  await event({ start_time: '12:00', end_time: '16:00', activity_name: 'Lunch' });
  await event({ start_time: '17:00', end_time: '18:30', activity_name: 'Snacks', is_optional: true });
  await event({ start_time: '17:00', end_time: '18:00', activity_name: 'Evening Yoga', is_optional: true, staff_scope: 'custom', staff_ids: [yogaStaff.id], staff_id: yogaStaff.id });
  await event({ start_time: '18:00', end_time: '19:00', activity_name: 'Evening Prayer Meditation', is_optional: true, staff_scope: 'custom', staff_ids: [prayerStaff.id], staff_id: prayerStaff.id });
  await event({ start_time: '18:30', end_time: '20:30', activity_name: 'Dinner' });
  // Mondays the havan runs over the morning prayer, and replaces it: where two
  // events overlap, the more specific one is the one that happens.
  await event({ weekdays: ['monday'], start_time: '08:30', end_time: '09:30', activity_name: 'Temple Havan Ritual', staff_scope: 'custom', staff_ids: [prayerStaff.id], staff_id: prayerStaff.id });

  // Seeded before the treatments so the treatments can go round them: a
  // therapist running Evening Yoga is not also giving a Spinal Basti at 17:30.
  const seededEvents = await prisma.programEvent.findMany();

  // Two weeks back as well as four months on: yesterday's day sheet, a Log with
  // something in it, and past days to check a report against.
  // Appointments for the next 4 months at ~30% capacity on business days, so a
  // test install stays useful for a full quarter.
  const start = centreToday();
  start.setDate(start.getDate() - 14);
  const end = centreToday();
  end.setMonth(end.getMonth() + 4);
  // The centre this dataset models treats from 09:00 to 13:00 and again from
  // 14:00 to 20:00, so the seed books across both halves — an evening with
  // nothing in it let the rota's evening column go untested for a release.
  // A couple of half-hour starts because a real day has them and the sheets
  // have to place them correctly.
  const dayTimes = ['09:00','10:00','11:00','12:00','14:00','15:00','16:30','17:30','18:30','19:00'];
  // One knob, not a second dataset: a stress fixture kept beside the demo one
  // drifts from it, and then a test passes on data no install has.
  const treatmentsPerRoom = Math.max(1, Math.min(dayTimes.length, Number(process.env.SEED_TREATMENTS_PER_ROOM) || 2));
  // Patients are taken in rotation rather than at random so a day's bookings
  // land on ~40 different people. A real centre of this size treats most of its
  // residents each day, and picking at random gave the same dozen names twice
  // over and a day sheet that looked half empty.
  let patientCursor = 0;
  const busy: Record<string, { staff: Record<string, { s: number; e: number }[]>; room: Record<string, { s: number; e: number }[]>; patient: Record<string, { s: number; e: number }[]> }> = {};
  const centerHolidays = await prisma.timeOff.findMany({ where: { entity_type: 'center', date: { gte: start, lte: end } } });
  const staffHolidaysByDay: Record<string, Set<string>> = {};
  for (const h of await prisma.timeOff.findMany({ where: { entity_type: 'staff', date: { gte: start, lte: end } } })) {
    if (!h.date) continue;
    const key = h.date.toISOString().slice(0,10);
    staffHolidaysByDay[key] ??= new Set<string>();
    if (h.entity_id) staffHolidaysByDay[key].add(h.entity_id);
  }
  const todayKey = centreYmd(new Date());
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const weekday = d.getDay();
    const dateKey = d.toISOString().slice(0,10);
    // Skip weekends, except today — a fresh install seeded on a Saturday
    // would otherwise open on an empty schedule.
    if ((weekday === 0 || weekday === 6) && dateKey !== todayKey) continue;
    if (centerHolidays.some(h => h.date && h.date.toISOString().slice(0,10) === dateKey)) continue;
    busy[dateKey] ??= {
      staff: Object.fromEntries(staff.map((s) => [s.id, staffEventBusy(seededEvents, s.id, new Date(dateKey)).map((b) => ({ s: b.s, e: b.e }))])),
      room: {}, patient: {},
    };
    // heuristic capacity: aim ~2 slots per room per day for 30% (assuming ~6 possible)
    for (const r of rooms) {
      const rDay = (scheduleStd as any)[['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][weekday]];
      if (!rDay) continue;
      // Two treatments per room per day: a centre of twenty rooms then treats
      // about forty of its residents, which is what the day sheet has to hold.
      // SEED_TREATMENTS_PER_ROOM raises that for checking how the sheet and the
      // screens behave at a size no demo install has.
      let slotsCreatedForRoom = 0;
      // Each room starts its rotation at a different hour. Walking dayTimes from
      // the front gave every room the two earliest starts, so the afternoon and
      // the evening were empty in a dataset that claims to cover them.
      const firstTime = (rooms.indexOf(r) * 3) % dayTimes.length;
      for (let ti = 0; ti < dayTimes.length; ti++) {
        const time = dayTimes[(firstTime + ti) % dayTimes.length];
        if (slotsCreatedForRoom >= treatmentsPerRoom) break;
        const th = randomOf(therapies);
        if (!th.required_amenities.every(a => r.amenities.includes(a))) continue;
        // Next patient in rotation who is free at this time, so one person's
        // clash does not cost the slot.
        const slotS = toMinutes(time);
        const slotE = slotS + th.duration_minutes;
        // The treatment itself must finish before the room closes; the buffer
        // after it is the patient's rest, not the room's next booking.
        if (slotS < toMinutes(rDay.start) || slotS + th.duration_minutes > toMinutes(rDay.end)) continue;
        const p = createdPatients
          .map((_, k) => createdPatients[(patientCursor + k) % createdPatients.length])
          .find((c) => !(busy[dateKey].patient[c.id] || []).some(b => overlaps(b.s, b.e, slotS, slotE)));
        if (!p) continue;
        patientCursor++;
        const sCandidates = staff.filter(s => s.specializations.includes(th.id) && (!th.requires_gender_match || s.gender === p.gender));
        // The first qualified therapist who is neither on leave nor already
        // busy. Taking the first qualified one and giving up when they were
        // booked was losing most of the day's slots to one person's diary.
        const staffOnLeave = staffHolidaysByDay[dateKey] || new Set<string>();
        // As many as the therapy needs, or the slot goes to something else.
        const team = sCandidates.filter(sc => !staffOnLeave.has(sc.id) &&
          !(busy[dateKey].staff[sc.id] || []).some(b => overlaps(b.s, b.e, slotS, slotE))).slice(0, th.staff_required);
        if (team.length < th.staff_required) continue;
        const [s, ...co] = team;
        const sMin = toMinutes(time);
        // Busy intervals carry the buffer, so the seed obeys the same rest and
        // cleanup rule the scheduler enforces.
        const eMin = sMin + th.duration_minutes;
        const rBusy = busy[dateKey].room[r.id] ??= [];
        const sBusy = busy[dateKey].staff[s.id] ??= [];
        const pBusy = busy[dateKey].patient[p.id] ??= [];
        const conflict = rBusy.some(b => overlaps(b.s, b.e, sMin, eMin)) || sBusy.some(b => overlaps(b.s, b.e, sMin, eMin)) || pBusy.some(b => overlaps(b.s, b.e, sMin, eMin));
        if (conflict) continue;
        for (const c of co) (busy[dateKey].staff[c.id] ??= []).push({ s: sMin, e: eMin });
        await prisma.appointment.create({ data: {
          patient_id: p.id,
          therapy_id: th.id,
          staff_id: s.id,
          co_staff_ids: co.map((c) => c.id),
          room_id: r.id,
          scheduled_date: new Date(dateKey),
          start_time: time,
          duration_minutes: th.duration_minutes,
          session_number: 1,
          total_sessions: 1,
          status: dateKey < todayKey ? 'completed' : 'pending',
          assignment_type: 'auto',
        } });
        rBusy.push({ s: sMin, e: eMin });
        sBusy.push({ s: sMin, e: eMin });
        pBusy.push({ s: sMin, e: eMin });
        slotsCreatedForRoom++;
      }
    }
  }

  const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1); nextMonth.setDate(10);
  for (let i = 0; i < 4; i++) {
    const d = new Date(nextMonth); d.setDate(nextMonth.getDate() + i * 5);
    await prisma.programEvent.create({ data: { date: d, start_time: '10:00', end_time: '11:00', activity_name: `Special Session ${i+1}`, room_id: null, staff_id: null, required_amenities: [], audience: 'all', notes: '', patients_scope: 'all' } });
  }

  // A therapist who is off today, with treatments still on their name. This is
  // the centre's daily crisis and the case the reassignment exists for, so the
  // dataset carries it on purpose rather than by accident: the bookings were
  // made before they rang in, which is how it happens. Four, in four different
  // hours, so a swap has somewhere to go.
  const absentToday = (await prisma.timeOff.findMany({ where: { entity_type: 'staff', date: centreToday() } }))[0]?.entity_id;
  if (absentToday) {
    const todays = await prisma.appointment.findMany({ where: { scheduled_date: centreToday() }, orderBy: { start_time: 'asc' } });
    const absentGender = staff.find((s) => s.id === absentToday)?.gender;
    const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const taken: { s: number; e: number }[] = [];
    const toMove = todays.filter((a) => {
      // Only single-handed treatments: the case here is one therapist's day, and
      // the absent one cannot also be the partner already on it.
      if (a.staff_id === absentToday || a.co_staff_ids.length > 0) return false;
      // Only what they could have been booked for: the day is wrong because
      // they are away, not because the seed broke the gender rule.
      const th = therapies.find((t) => t.id === a.therapy_id);
      const pt = createdPatients.find((c) => c.id === a.patient_id);
      if (th?.requires_gender_match && pt?.gender !== absentGender) return false;
      // Nor a therapy they are not trained in: that made the resident locked to
      // them impossible to place on any day (#135).
      if (!staff.find((x) => x.id === absentToday)?.specializations.includes(a.therapy_id)) return false;
      const s = mins(a.start_time);
      const e = s + a.duration_minutes;
      // One person cannot give two treatments at once, even the ones they will
      // not be here to give: the day has to be wrong in the way a real day is.
      if (taken.some((b) => Math.max(b.s, s) < Math.min(b.e, e))) return false;
      taken.push({ s, e });
      return true;
    }).slice(0, 4);
    for (const a of toMove) {
      await prisma.appointment.update({ where: { id: a.id }, data: { staff_id: absentToday } });
    }
  }

  // One resident who is only treated by their own therapist. The replan cannot
  // swap their hands, so it offers them another time — which is the case that
  // looks right until you meet it, and is now in the dataset by default.
  const todaysBookings = await prisma.appointment.findMany({ where: { scheduled_date: new Date(todayKey) } });
  const offToday = new Set((await prisma.timeOff.findMany({ where: { entity_type: 'staff', date: new Date(todayKey) } })).map((h) => h.entity_id));
  const loyal = todaysBookings.find((a) => a.staff_id && offToday.has(a.staff_id));
  if (loyal?.staff_id) {
    await prisma.patient.update({
      where: { id: loyal.patient_id },
      data: { preferred_staff_id: loyal.staff_id, requires_preferred_staff: true },
    });
  }

  // Demo login. Idempotent so re-seeding never locks you out, and never
  // overwrites the password if you have already changed it.
  const existingAdmin = await prisma.user.findUnique({ where: { email: DEFAULT_ADMIN_EMAIL } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: DEFAULT_ADMIN_EMAIL,
        password_hash: await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10),
        name: 'Demo Admin',
        role: 'admin',
      },
    });
    console.log(`Created demo admin: ${DEFAULT_ADMIN_EMAIL} / ${DEFAULT_ADMIN_PASSWORD}`);
  }

  // Diet plans are the centre's own content, so these are a starting set rather
  // than demo data: a fresh install has something to assign on day one, and the
  // centre edits them in the Diet tab. Upserted by name, so re-seeding does not
  // overwrite a plan someone has since changed.
  await ensureStarterDietTemplates(prisma);

  // Residents. Without these the demo has nobody actually staying at the centre,
  // so the day sheet shows neither meals nor the rest-day rows — two features
  // that would look missing rather than unseeded.
  const today = centreToday();
  const templates = await prisma.dietTemplate.findMany({ orderBy: { name: 'asc' } });
  // Fifteen-day stays back to back until the bookings end, so every day's sheet
  // has residents. The first stay holds today's treated patients.
  let residents: { id: string }[] = [];
  for (let windowStart = new Date(today.getTime() - 5 * 86400000); windowStart <= end; windowStart = new Date(windowStart.getTime() + 15 * 86400000)) {
    const windowEnd = new Date(windowStart.getTime() + 14 * 86400000);
    const anchor = windowStart < today ? today : windowStart;
    const treated = await prisma.appointment.findMany({
      // Today's stay takes only today's patients; later ones look a few days
      // ahead so a stay starting on a weekend still has someone in it.
      where: { scheduled_date: { gte: anchor, lte: new Date(anchor.getTime() + (anchor === today ? 0 : 2) * 86400000) } },
      select: { patient_id: true },
      distinct: ['patient_id'],
    });
    // A couple of residents with no treatment, so the sheet shows what a rest
    // day looks like: no therapy, meals still theirs.
    const resting = createdPatients.filter((p) => !treated.some((a) => a.patient_id === p.id)).slice(0, 2);
    const stay = [...treated.map((a) => ({ id: a.patient_id })), ...resting];
    if (residents.length === 0) residents = stay;
    for (const [idx, resident] of stay.entries()) {
      await prisma.patientStay.create({
        data: { patient_id: resident.id, start_date: windowStart, end_date: windowEnd, duration_days: 15 },
      });
      // Not everyone: a centre always has someone whose plan has not been set yet,
      // and the sheet should show that honestly rather than inventing one.
      if (idx % 6 === 5 || templates.length === 0) continue;
      await prisma.dietPlanSegment.create({
        data: { patient_id: resident.id, start_date: windowStart, end_date: windowEnd, template_id: templates[idx % templates.length].id },
      });
    }
  }

  // One patient given something different for one meal today, so the override
  // that a template edit must not overwrite is visible in the demo.
  const overridden = residents[0];
  if (overridden) {
    await prisma.dietPlan.create({
      data: {
        patient_id: overridden.id,
        date: today,
        meal_time: 'lunch',
        description: 'Rice gruel only',
        instructions: 'post-Virechana',
        created_by: (await prisma.user.findUnique({ where: { email: DEFAULT_ADMIN_EMAIL }, select: { id: true } }))?.id ?? 'seed',
      },
    });
  }

  // Flags this install as carrying demo data, so Settings can offer to clear it.
  // Seeded means configured: an install arriving with staff, rooms, therapies
  // and a week of bookings is not a centre that has yet to say what it is
  // called, and sending it to the setup wizard asks for what it already has.
  await prisma.settings.upsert({
    where: { id: 'singleton' },
    update: { demo_data: true, setup_complete: true },
    create: {
      id: 'singleton', demo_data: true, setup_complete: true,
      centre_name: process.env.CENTRE_NAME || 'Wellness Centre',
      // The modelled centre treats into the evening, and the Schedule grid is
      // built from these, so a 19:00 treatment is invisible without them.
      opening_time: '09:00', closing_time: '20:00',
    },
  });

  console.log('Seeded extended AyurCalm dataset successfully');
}

main().finally(async () => {
  prisma.$disconnect();
});
