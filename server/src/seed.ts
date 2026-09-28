import { therapyLibrary } from './therapyLibrary.js';
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

  // Gender follows the first name: 'Aarav Gupta (f)' in the booking picker read
  // as a broken demo (#67). Every other first name in these lists is a woman's.
  const MEN = new Set(['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Krishna','Venkatasubramanian','Raj','Kumar','Ravi','Suresh','Arvind','Kiran','Alok','Manish','Rohit','Dev']);
  const isMale = (name: string) => MEN.has(name.split(' ')[0]);
  const patients: string[] = [];
  const surnames = ['Sharma','Verma','Iyer','Nair','Reddy','Patel','Singh','Gupta','Joshi','Chatterjee','Das','Banerjee','Mishra','Yadav','Khan'];
  const firstNames = ['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Krishna','Ananya','Diya','Aarohi','Ishita','Sneha','Riya','Nisha','Meera'];
  // Every name distinct: two "Riya Das" rows on the day sheet read as a mistake.
  for (let i = 0; i < 120; i++) patients.push(`${firstNames[i % 15]} ${surnames[Math.floor(i / 15)]}`);
  // One name long enough to be shortened on the day sheet, as some real ones are.
  patients[7] = 'Venkatasubramanian Raghunathan';

  const createdPatients = await Promise.all(patients.map((name, idx) => prisma.patient.create({
    data: { name, gender: isMale(name) ? 'male' : 'female', phone: `+91-9${Math.floor(100000000 + random()*899999999)}` },
  })));

  // The library is the demo's treatment list (#219): the same one a new centre
  // imports from, so the demo shows what a centre gets.
  const allTherapies = await Promise.all(therapyLibrary.map((t) => prisma.therapy.create({ data: {
    name: t.name, description: t.description, duration_minutes: t.minutes, staff_required: t.staff,
    required_amenities: t.amenities, products: t.products, requires_gender_match: t.gender, is_consultation: Boolean(t.consultation),
  } })));
  const therapies = allTherapies.filter((t) => !t.is_consultation);

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
      gender: isMale(n) ? 'male' : 'female',
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
  // made before they rang in, which is how it happens. Three or four, in
  // different hours, so a swap has somewhere to go. Whether the therapist on
  // leave can take any depends on who else the day booked, so if they cannot,
  // someone else is the one off today: a demo without the case has lost the
  // first thing it shows (#141).
  const todays = await prisma.appointment.findMany({ where: { scheduled_date: centreToday() }, orderBy: { start_time: 'asc' } });
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const movableTo = (absent: (typeof staff)[number]) => {
    // Their own treatments today are already on their name, and one person
    // cannot give two at once, even the ones they will not be here to give.
    const own = todays.filter((a) => a.staff_id === absent.id || a.co_staff_ids.includes(absent.id));
    const taken = own.map((a) => ({ s: mins(a.start_time), e: mins(a.start_time) + a.duration_minutes }));
    const moved = todays.filter((a) => {
      if (taken.length >= 4) return false;
      // Only single-handed treatments: the case here is one therapist's day.
      if (a.staff_id === absent.id || a.co_staff_ids.length > 0) return false;
      // Only what they could have been booked for: the day is wrong because
      // they are away, not because the seed broke the gender rule, nor given
      // a therapy they are not trained in, which left the resident locked to
      // them impossible to place on any day (#135).
      const th = therapies.find((t) => t.id === a.therapy_id);
      const pt = createdPatients.find((c) => c.id === a.patient_id);
      if (th?.requires_gender_match && pt?.gender !== absent.gender) return false;
      if (!absent.specializations.includes(a.therapy_id)) return false;
      const s = mins(a.start_time);
      const e = s + a.duration_minutes;
      if (taken.some((b) => overlaps(b.s, b.e, s, e))) return false;
      taken.push({ s, e });
      return true;
    });
    return { own, moved };
  };
  // The one already on leave first; then whoever has least booked today and
  // runs no event, so their being away does not also empty the yoga room.
  const candidates = [onLeaveToday, ...staff
    .filter((s) => s.id !== onLeaveToday.id && s.id !== yogaStaff.id && s.id !== prayerStaff.id && !offTodayIds.has(s.id))
    .sort((a, b) => todays.filter((t) => t.staff_id === a.id).length - todays.filter((t) => t.staff_id === b.id).length)];
  const absent = candidates.find((c) => { const { own, moved } = movableTo(c); const n = own.length + moved.length; return n >= 3 && n <= 4; });
  if (absent) {
    if (absent.id !== onLeaveToday.id) {
      await prisma.timeOff.updateMany({ where: { entity_type: 'staff', entity_id: onLeaveToday.id, date: centreToday() }, data: { entity_id: absent.id } });
    }
    for (const a of movableTo(absent).moved) {
      await prisma.appointment.update({ where: { id: a.id }, data: { staff_id: absent.id } });
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
  // A resident's stay spans their own course, so every booking sits inside one:
  // the app books a resident only while they are here (#142). Bookings more
  // than three days apart are separate visits.
  const DAY_MS = 86400000;
  const booked = await prisma.appointment.findMany({ select: { patient_id: true, scheduled_date: true }, orderBy: { scheduled_date: 'asc' } });
  const datesOf = new Map<string, Date[]>();
  for (const a of booked) {
    if (!datesOf.has(a.patient_id)) datesOf.set(a.patient_id, []);
    datesOf.get(a.patient_id)!.push(a.scheduled_date);
  }
  const residents: { id: string }[] = [];
  let stayCount = 0;
  const addStay = async (patient_id: string, start_date: Date, end_date: Date) => {
    await prisma.patientStay.create({
      data: { patient_id, start_date, end_date, duration_days: Math.round((end_date.getTime() - start_date.getTime()) / DAY_MS) + 1 },
    });
    // Not everyone: a centre always has someone whose plan has not been set yet,
    // and the sheet should show that honestly rather than inventing one.
    const planned = stayCount++ % 6 !== 5 && templates.length > 0;
    if (planned) {
      await prisma.dietPlanSegment.create({
        data: { patient_id, start_date, end_date, template_id: templates[stayCount % templates.length].id },
      });
    }
    if (planned && start_date <= today && today <= end_date) residents.push({ id: patient_id });
  };
  for (const [patientId, dates] of datesOf) {
    let start = dates[0];
    let last = dates[0];
    for (const d of dates.slice(1)) {
      if (d.getTime() - last.getTime() > 3 * DAY_MS) {
        await addStay(patientId, start, last);
        start = d;
      }
      last = d;
    }
    await addStay(patientId, start, last);
  }
  // A couple in house today with nothing booked, so the sheet shows what a rest
  // day looks like: no therapy, meals still theirs.
  const nearToday = new Set(booked.filter((a) => Math.abs(a.scheduled_date.getTime() - today.getTime()) <= 3 * DAY_MS).map((a) => a.patient_id));
  for (const p of createdPatients.filter((x) => !nearToday.has(x.id)).slice(0, 2)) {
    await addStay(p.id, new Date(today.getTime() - 2 * DAY_MS), new Date(today.getTime() + 3 * DAY_MS));
  }

  // Someone arriving today and someone leaving, so the day list and the sheet
  // show both without waiting for the calendar to line one up.
  const unbooked = createdPatients.filter((x) => !nearToday.has(x.id)).slice(2, 4);
  if (unbooked[0]) await addStay(unbooked[0].id, today, new Date(today.getTime() + 6 * DAY_MS));
  if (unbooked[1]) await addStay(unbooked[1].id, new Date(today.getTime() - 5 * DAY_MS), today);

  // The rest of an ordinary day's changes, each once, so every row flag and
  // History line in the design has real data behind it (#159). Taken from
  // today's treatments that neither the therapist off nor the resident locked
  // to one therapist depend on, so the day's planned problems stay as they are.
  const adminId = (await prisma.user.findUnique({ where: { email: DEFAULT_ADMIN_EMAIL }, select: { id: true } }))?.id ?? 'seed';
  const spare = (await prisma.appointment.findMany({ where: { scheduled_date: today, status: 'pending' }, orderBy: { start_time: 'asc' } }))
    .filter((a) => !(a.staff_id && offToday.has(a.staff_id)) && a.patient_id !== loyal?.patient_id);
  const [noShow, cancelled, noted, moved] = [spare[0], spare[Math.floor(spare.length / 3)], spare[Math.floor(spare.length / 2)], spare[spare.length - 1]];
  const change = async (a: (typeof spare)[number] | undefined, data: Record<string, unknown>) => {
    if (!a) return;
    const after = await prisma.appointment.update({ where: { id: a.id }, data });
    await prisma.auditLog.create({ data: { admin_id: adminId, action: 'update', entity_type: 'appointment', entity_id: a.id, old_value: a as any, new_value: after as any } });
  };
  await change(noShow, { status: 'no_show' });
  if (cancelled !== noShow) await change(cancelled, { status: 'cancelled' });
  if (noted !== cancelled) await change(noted, { notes: 'Prefers a lighter touch on the shoulders' });
  // Moved from yesterday: the History line is what shows it was moved.
  if (moved && moved !== noted) {
    const yesterday = new Date(today.getTime() - DAY_MS);
    await prisma.appointment.update({ where: { id: moved.id }, data: { scheduled_date: yesterday } });
    await change({ ...moved, scheduled_date: yesterday }, { scheduled_date: today });
  }
  // A room out of use for the afternoon, chosen among rooms with nothing booked
  // then, so it shows as closed without adding a problem Verify must solve.
  const afternoon = (t: string) => t >= '14:00';
  const bookedAfternoon = new Set(spare.filter((a) => afternoon(a.start_time)).map((a) => a.room_id));
  const idleRoom = rooms.find((r) => !bookedAfternoon.has(r.id) && !todaysBookings.some((a) => a.room_id === r.id && afternoon(a.start_time)));
  if (idleRoom) {
    await prisma.timeOff.create({ data: { entity_type: 'room', entity_id: idleRoom.id, date: today, start_time: '14:00', end_time: '20:00', description: 'Plumbing repair' } });
  }

  // Doctors (#219): three, sharing two consultation rooms that no treatment
  // needs. Each stay opens with a consultation and has one a week after it, so
  // the card shows a last and a next, and the doctor rota has a morning on it.
  const consultation = allTherapies.find((t) => t.is_consultation)!;
  const consultRooms = await Promise.all(['Charaka', 'Sushruta'].map((name) => prisma.therapyRoom.create({
    data: { name, amenities: ['bp_monitor', 'examination_bed'], weekly_schedule: scheduleStd, is_active: true },
  })));
  const doctors = await Promise.all([['Dr Lakshmi Menon', 'female'], ['Dr Vikram Rao', 'male'], ['Dr Farah Siddiqui', 'female']].map(([name, gender]) =>
    prisma.staff.create({ data: { name, gender: gender as 'male' | 'female', role: 'doctor', specializations: [consultation.id], weekly_schedule: scheduleStd, is_active: true, phone: `+91-7${Math.floor(100000000 + random() * 899999999)}` } })));
  const holidayKeys = new Set(centerHolidays.map((h) => h.date && h.date.toISOString().slice(0, 10)));
  const consultSlots = Array.from({ length: 12 }, (_, i) => { const m = 9 * 60 + i * 20; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; });
  const takenBy = new Map<string, Set<string>>(); // "date|time" -> doctor and room ids already booked
  const plans = [
    'Continue Abhyanga daily. Light diet, no curd at night. Review BP next week.',
    'Pain easing. Add Kati Vasti for 5 days; reduce oil in lunch.',
    'Good progress. Start Virechana preparation; ghee in the morning for 3 days.',
    'Sleep improved. Keep Shirodhara every second day; walk after dinner.',
  ];
  for (const stay of await prisma.patientStay.findMany({ where: { end_date: { gte: start } } })) {
    let consulted = false;
    for (let d = new Date(stay.start_date); d <= stay.end_date && d <= end; d = new Date(d.getTime() + 7 * DAY_MS)) {
      const dateKey = d.toISOString().slice(0, 10);
      if (holidayKeys.has(dateKey)) continue;
      const theirs = await prisma.appointment.findMany({ where: { patient_id: stay.patient_id, scheduled_date: d } });
      for (const time of consultSlots) {
        const s = mins(time);
        if (theirs.some((a) => overlaps(mins(a.start_time), mins(a.start_time) + a.duration_minutes, s, s + 20))) continue;
        const taken = takenBy.get(`${dateKey}|${time}`) ?? new Set<string>();
        const doctor = doctors.find((x) => !taken.has(x.id));
        const room = consultRooms.find((x) => !taken.has(x.id));
        if (!doctor || !room) continue;
        const past = dateKey < todayKey;
        await prisma.appointment.create({ data: {
          patient_id: stay.patient_id, therapy_id: consultation.id, staff_id: doctor.id, room_id: room.id,
          scheduled_date: new Date(dateKey), start_time: time, duration_minutes: 20, session_number: 1, total_sessions: 1,
          status: past ? 'completed' : 'pending', assignment_type: 'auto', notes: past ? randomOf(plans) : null,
        } });
        takenBy.set(`${dateKey}|${time}`, new Set([...taken, doctor.id, room.id]));
        consulted ||= past;
        break;
      }
    }
    if (consulted) await prisma.patient.update({ where: { id: stay.patient_id }, data: { doctor_plan: randomOf(plans) } });
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
