import { randomBytes } from 'node:crypto';
import { therapyLibrary } from './therapyLibrary.js';
import 'dotenv/config';
import { ensureStarterDietTemplates, usualNotes } from './dietTemplateSeed.js';
import { ensureStarterCatalogues } from './catalogueSeed.js';
import { PrismaClient } from '@prisma/client';
import { hoursOn, staffEventBusy } from './availability.js';
import bcrypt from 'bcrypt';
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } from './auth.js';
import { indiaHolidays } from "./indiaHolidays.js";
import { readFileSync } from 'node:fs';
import { saveDischarge } from './discharge.js';

const prisma = new PrismaClient();

const ayurvedaRoomNames = [
  'Dhanvantari', 'Nasatya', 'Dasra', 'Shiva', 'Vishnu', 'Lakshmi', 'Parvati', 'Ganesha',
  'Hanuman', 'Saraswati', 'Surya', 'Chandra', 'Agni', 'Vayu', 'Indra', 'Varuna', 'Kubera', 'Yama', 'Brahma', 'Narada'
];

const amenitiesSet = ['massage_table','shower','steam','herbal_oil','shirodhara_stand','dhara_stand','rice_boluses','herbal_paste'];


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

async function ensureAdmin() {
  // Demo login. Idempotent so re-seeding never locks you out, and never
  // overwrites the password if you have already changed it.
  // A cloud trial (#247) passes ADMIN_EMAIL: that person is the admin, with a
  // random password they never see; they sign in from the emailed link.
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || DEFAULT_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_EMAIL ? randomBytes(24).toString('hex') : DEFAULT_ADMIN_PASSWORD;
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        password_hash: await bcrypt.hash(adminPassword, 10),
        name: process.env.ADMIN_EMAIL ? 'Admin' : 'Demo Admin',
        role: 'admin',
      },
    });
    console.log(`Created admin: ${adminEmail}`);
  }
}

async function main() {
  // A new cloud trial (#247) starts empty: its admin, the starter diet plans,
  // and the setup wizard. Seeding the demo only for the wizard to clear it
  // took over two minutes of the sign-up. Safe to repeat on every boot.
  if (process.env.ADMIN_EMAIL) {
    await ensureAdmin();
    await ensureStarterDietTemplates(prisma);
    await ensureStarterCatalogues(prisma);
    const support = process.env.DEFAULT_SUPPORT_WHATSAPP ?? '420777558262';
    await prisma.settings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton', setup_complete: false, demo_data: false, support_whatsapp: support || null, patient_support_whatsapp: support || null } });
    console.log('Trial centre ready for its setup wizard');
    return;
  }
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

  // Two sizes of one dataset (#348): the full one tests and CI run on, a centre
  // with about 45 in house; the lite one the public demo and a new install show,
  // about 12 in house, small enough for an admin to take in at a glance.
  const LITE = process.env.DEMO_MODE === 'true' || process.env.SEED_SIZE === 'lite';
  const SIZE = LITE
    ? { therapists: 6, rooms: 5, doctors: 1, history: 3, arrivals: [0, 1, 1, 2] }
    : { therapists: 16, rooms: 12, doctors: 2, history: 14, arrivals: [2, 3, 3, 4] };

  // Gender follows the first name: 'Aarav Gupta (f)' in the booking picker read
  // as a broken demo (#67). Every other first name in these lists is a woman's.
  const MEN = new Set(['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Krishna','Venkatasubramanian','Raj','Kumar','Ravi','Suresh','Arvind','Kiran','Alok','Manish','Rohit','Dev']);
  const isMale = (name: string) => MEN.has(name.split(' ')[0]);
  const names: string[] = [];
  const surnames = ['Sharma','Verma','Iyer','Nair','Reddy','Patel','Singh','Gupta','Joshi','Chatterjee','Das','Banerjee','Mishra','Yadav','Khan'];
  const firstNames = ['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Krishna','Ananya','Diya','Aarohi','Ishita','Sneha','Riya','Nisha','Meera'];
  // Every name distinct: two "Riya Das" rows on the day sheet read as a mistake.
  for (let i = 0; i < 225; i++) names.push(`${firstNames[i % 15]} ${surnames[Math.floor(i / 15)]}`);
  // One name long enough to be shortened on the day sheet, as some real ones are.
  names[48] = 'Venkatasubramanian Raghunathan';

  // The library is the demo's treatment list (#219): the same one a new centre
  // imports from, so the demo shows what a centre gets.
  const allTherapies = await Promise.all(therapyLibrary.map((t) => prisma.therapy.create({ data: {
    name: t.name, description: t.description, duration_minutes: t.minutes, staff_required: t.staff,
    required_amenities: t.amenities, products: t.products, requires_gender_match: t.gender, is_consultation: Boolean(t.consultation), once_per_course: Boolean(t.once), before_purification: Boolean(t.before),
    // What the link asks at each (#219): a doctor takes more readings than a therapist.
    checklist: t.consultation ? [] : [{ text: "Room and table prepared", required: true }, { text: "Oils or powders ready", required: true }, { text: "Asked how they feel today", required: false }],
    vitals: t.consultation ? ["bp", "pulse", "weight"] : ["bp"],
  } })));
  const therapies = allTherapies.filter((t) => !t.is_consultation);

  const scheduleStd = { sunday: { start: '09:00', end: '20:00' }, monday: { start: '09:00', end: '20:00' }, tuesday: { start: '09:00', end: '20:00' }, wednesday: { start: '09:00', end: '20:00' }, thursday: { start: '09:00', end: '20:00' }, friday: { start: '09:00', end: '20:00' }, saturday: { start: '09:00', end: '20:00' } };

  // Shifts as a centre staffs them (#351): early 07:00-15:00 (the morning yoga and prayer),
  // afternoon 13:00-20:00 (the evening ones), and a day 09:00-18:00; the third therapist has
  // Wednesday off. The last is the day shift, as they are the one on leave today, with a whole day to move.
  const week = (start: string, end: string, off: string[] = []) => Object.fromEntries(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, off.includes(d) ? null : { start, end }]));
  const shiftOf = (idx: number, n: number) => idx === n - 1 || idx % 3 === 2 ? week('09:00', '18:00', idx === 2 ? ['wednesday'] : []) : idx % 3 === 0 ? week('07:00', '15:00') : week('13:00', '20:00');

  // Every other room is fully equipped; with only the first four amenities
  // everywhere, dhara, kizhi and lepam therapies could never be booked.
  const rooms = await Promise.all(ayurvedaRoomNames.slice(0, SIZE.rooms).map((rn, idx) => prisma.therapyRoom.create({
    data: { name: rn, amenities: idx % 2 ? amenitiesSet : amenitiesSet.slice(0, 4), weekly_schedule: scheduleStd, is_active: true },
  })));

  // Therapists, not physicians. The 'Dr.' the seed used to carry was wrong for
  // most of them and made every rota column a word narrower.
  const staffNames = ['Priya','Raj','Anjali','Kumar','Neha','Ravi','Asha','Suresh','Meera','Arvind','Pooja','Kiran','Alok','Varsha','Manish','Bhavna','Rohit','Trisha','Dev','Kriti'];
  const staff = await Promise.all(staffNames.slice(0, SIZE.therapists).map((n, idx) => prisma.staff.create({
    data: {
      name: `${n} ${randomOf(surnames)}`,
      gender: isMale(n) ? 'male' : 'female',
      phone: `+91-8${Math.floor(100000000 + random()*899999999)}`,
      specializations: therapies.filter((_, j) => j % (idx % 3 + 2) === 0).map(t => t.id),
      weekly_schedule: shiftOf(idx, SIZE.therapists),
      is_active: true,
    },
  })));

  for (const h of indiaHolidays) {
    await prisma.timeOff.create({ data: { entity_type: "center", date: new Date(h.date), description: h.name } });
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
  // Morning classes go to the early shift, evening ones to the afternoon shift: each is in their hours.
  const shift = (start: string) => staff.filter((s) => (s.weekly_schedule as Record<string, { start: string } | null>).monday?.start === start && !offTodayIds.has(s.id));
  const leader = (list: typeof staff, not?: string) => list.find((s) => s.gender === 'female' && s.id !== not) || list.find((s) => s.id !== not) || staff[0];
  const yogaStaff = leader(shift('07:00'));
  const prayerStaff = leader(shift('07:00').filter((s) => s.id !== yogaStaff.id));
  const eveningYoga = leader(shift('13:00'));
  const eveningPrayer = leader(shift('13:00').filter((s) => s.id !== eveningYoga.id));
  const event = (over: Record<string, unknown>) => prisma.programEvent.create({ data: {
    recurrence: 'weekly', weekdays, room_id: null, staff_id: null, required_amenities: [],
    notes: '', audience: 'all', patients_scope: 'all', staff_scope: 'none', staff_ids: [],
    is_optional: false, start_time: '00:00', end_time: '00:00', activity_name: '',
    ...over,
  } as any });

  await event({ start_time: '07:00', end_time: '08:00', activity_name: 'Morning Yoga', is_optional: true, staff_scope: 'custom', staff_ids: [yogaStaff.id], staff_id: yogaStaff.id });
  await event({ start_time: '08:30', end_time: '09:00', activity_name: 'Morning Prayer Meditation', is_optional: true, staff_scope: 'custom', staff_ids: [prayerStaff.id], staff_id: prayerStaff.id });
  await event({ start_time: '08:00', end_time: '08:45', activity_name: 'Breakfast', notes: 'Diet per plan' });
  await event({ start_time: '12:30', end_time: '13:30', activity_name: 'Lunch' });
  await event({ start_time: '16:30', end_time: '17:00', activity_name: 'Snacks', is_optional: true });
  await event({ start_time: '17:00', end_time: '18:00', activity_name: 'Evening Yoga', is_optional: true, staff_scope: 'custom', staff_ids: [eveningYoga.id], staff_id: eveningYoga.id });
  await event({ start_time: '18:00', end_time: '19:00', activity_name: 'Evening Prayer Meditation', is_optional: true, staff_scope: 'custom', staff_ids: [eveningPrayer.id], staff_id: eveningPrayer.id });
  await event({ start_time: '19:30', end_time: '20:15', activity_name: 'Dinner' });
  // Mondays the havan runs over the morning prayer, and replaces it: where two
  // events overlap, the more specific one is the one that happens.
  await event({ weekdays: ['monday'], start_time: '08:30', end_time: '09:30', activity_name: 'Temple Havan Ritual', staff_scope: 'custom', staff_ids: [prayerStaff.id], staff_id: prayerStaff.id });

  // Seeded before the treatments so the treatments can go round them: a
  // therapist running Evening Yoga is not also giving a Spinal Basti at 17:30.
  const seededEvents = await prisma.programEvent.findMany();

  // History behind today (yesterday's sheet, a Log, past days for a report) and
  // three weeks of arrivals ahead. Treatments ahead are only what a doctor has
  // planned: most residents a week at a time, a few their whole course.
  const start = centreToday();
  start.setDate(start.getDate() - SIZE.history);
  const end = centreToday();
  end.setDate(end.getDate() + 21);
  // The centre this dataset models treats from 09:00 to 13:00 and again from
  // 14:00 to 20:00, so the seed books across both halves — an evening with
  // nothing in it let the rota's evening column go untested for a release.
  // A couple of half-hour starts because a real day has them and the sheets
  // have to place them correctly.
  // Starts every half hour, so a 40-minute treatment does not leave its
  // therapist idle until the next hour: the demo books about half their time.
  const dayTimes = ['09:00','09:30','10:00','10:30','11:00','11:30','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30'];
  // One knob, not a second dataset: a stress fixture kept beside the demo one
  // drifts from it, and then a test passes on data no install has.
  // Each day brings a few arrivals of four kinds (#348): a residential course
  // (14 or 21 days), a short one (7), a day visitor, and an outpatient who comes
  // on separate days without staying. One in five has the whole course planned
  // on arrival; the rest are planned a week at a time, at the doctor's review.
  const DAY = 86400000;
  type Stay = { s: Date; e: Date; kind: 'course' | 'short' | 'day' | 'out'; full: boolean };
  const kinds: Stay['kind'][] = [...Array(12).fill('course'), ...Array(5).fill('short'), 'day', 'day', 'out'];
  const people: { name: string; stays: Stay[] }[] = [];
  for (let d = new Date(start.getTime() - 21 * DAY); d <= end; d = new Date(d.getTime() + DAY)) {
    for (let n = randomOf(SIZE.arrivals); n > 0; n--) {
      const kind = randomOf(kinds);
      const full = random() < 0.2;
      // A step of 16 moves both the first name and the surname, so a small demo is not all Sharmas.
      const name = names[(people.length * 16) % names.length];
      if (kind === 'out') { people.push({ name, stays: [0, 3, 6].map((k) => ({ s: new Date(d.getTime() + k * DAY), e: new Date(d.getTime() + k * DAY), kind, full })) }); continue; }
      const days = kind === 'course' ? randomOf([14, 21]) : kind === 'short' ? 7 : 1;
      people.push({ name, stays: [{ s: new Date(d), e: new Date(d.getTime() + (days - 1) * DAY), kind, full }] });
    }
  }
  const createdPatients = await Promise.all(people.map(({ name }) => prisma.patient.create({
    data: { name, gender: isMale(name) ? 'male' : 'female', phone: `+91-9${Math.floor(100000000 + random()*899999999)}` },
  })));
  const staysOf = new Map<string, Stay[]>(createdPatients.map((p, i) => [p.id, people[i].stays]));
  // A few leave every day in a real centre, so today always has departures to
  // write discharge summaries for: two stays running past today end today.
  {
    const t = centreYmd(new Date());
    const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
    const all = [...staysOf.values()].flat();
    let short = 2 - all.filter((x) => ymdOf(x.e) === t && ymdOf(x.s) < t).length;
    for (const x of all) {
      if (short <= 0) break;
      if (ymdOf(x.s) < t && ymdOf(x.e) > t) { x.e = new Date(`${t}T00:00:00.000Z`); short--; }
    }
  }
  // Required meals are the resident's own time: no treatment runs through one.
  const meals = seededEvents.filter((e) => !e.is_optional && e.activity_name !== 'Temple Havan Ritual').map((e) => ({ s: toMinutes(e.start_time), e: toMinutes(e.end_time) }));
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
  const inHours = (sc: { weekly_schedule: unknown }, dateKey: string, from: number, to: number) => { const h = hoursOn(sc.weekly_schedule, new Date(dateKey)); return !!h && h.s <= from && to <= h.e; };
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  // Virechana as a centre gives it (#359): once in a course, one morning dose at 09:00-11:00 after
  // three mornings of Snehapana, nothing after it that day, then the after-purification diet.
  // Every third residential course of 12 days or more has one, on its ninth day.
  const ONCE = ['Vamana', 'Virechana', 'Snehapana'];
  const pool = therapies.filter((t) => !ONCE.includes(t.name));
  const virechana = therapies.find((t) => t.name === 'Virechana');
  const snehapana = therapies.find((t) => t.name === 'Snehapana');
  const purgeDay = new Map<Stay, string>();
  let courses = 0;
  for (const list of staysOf.values()) for (const x of list) {
    if (x.kind !== 'course' || x.e.getTime() - x.s.getTime() < 11 * DAY) continue;
    if (courses++ % 3 === 0 && virechana) purgeDay.set(x, new Date(x.s.getTime() + 8 * DAY).toISOString().slice(0, 10));
  }
  // Each week of a stay has its pair of therapies; at a review a third of plans swap one (#348).
  const pairs = new Map<string, typeof therapies>();
  const pairFor = (pid: string, week: number): typeof therapies => {
    const key = `${pid}|${week}`;
    if (!pairs.has(key)) {
      const prev = week > 0 ? pairFor(pid, week - 1) : null;
      const pick = () => randomOf(pool);
      const pair = prev ? (random() < 1 / 3 ? [prev[0], pick()] : prev) : [pick(), pick()];
      pairs.set(key, pair[0].id === pair[1].id ? [pair[0], pick()] : pair);
    }
    return pairs.get(key)!;
  };
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + DAY)) {
    const dateKey = ymd(d);
    if (centerHolidays.some(h => h.date && ymd(h.date) === dateKey)) continue;
    busy[dateKey] ??= {
      staff: Object.fromEntries(staff.map((s) => [s.id, staffEventBusy(seededEvents, s.id, new Date(dateKey)).map((b) => ({ s: b.s, e: b.e }))])),
      room: {}, patient: {},
    };
    // A Virechana course is booked first on its mornings, so 09:00-11:00 is still free for it.
    const purgingToday = new Set([...staysOf.entries()].filter(([, l]) => l.some((x) => { const v = purgeDay.get(x); return v && v >= dateKey && Date.parse(v) - Date.parse(dateKey) <= 3 * DAY; })).map(([id]) => id));
    for (const [pi, p] of [...createdPatients.entries()].sort(([, a], [, b]) => Number(purgingToday.has(b.id)) - Number(purgingToday.has(a.id)))) {
      const st = staysOf.get(p.id)!.find((x) => ymd(x.s) <= dateKey && dateKey <= ymd(x.e));
      if (!st) continue;
      const sKey = ymd(st.s);
      // Nothing is planned for someone who has not arrived, and a weekly plan
      // reaches only to the next review: seven days on from arrival, and every seven after.
      if (dateKey > todayKey) {
        if (sKey > todayKey) continue;
        const nextReview = new Date(st.s.getTime() + Math.ceil((centreToday().getTime() - st.s.getTime() + 1) / (7 * DAY)) * 7 * DAY);
        if (!st.full && dateKey >= ymd(nextReview)) continue;
      }
      // Two a day, now and then three, one on a rest day and on arrival and departure days.
      const r = random();
      const count = st.kind === 'out' ? 1 : st.kind === 'day' ? (r < 0.5 ? 1 : 2)
        : dateKey === sKey || dateKey === ymd(st.e) ? 1 : r < 0.1 ? 1 : r < 0.9 ? 2 : 3;
      const pair = pairFor(p.id, Math.floor((d.getTime() - st.s.getTime()) / (7 * DAY)));
      const purge = purgeDay.get(st);
      const before = purge ? Math.round((Date.parse(purge) - Date.parse(dateKey)) / DAY) : -1;
      // The Virechana day holds only Virechana; the three mornings before it start with Snehapana.
      const wanted = before === 0 ? [virechana!] : before > 0 && before <= 3 && snehapana ? [snehapana, ...pair].slice(0, Math.max(count, 2)) : [...pair, randomOf(pool)].slice(0, count);
      const given = new Set<string>();
      for (const want of wanted) {
        const once = ONCE.includes(want.name);
        // A therapy with no free hands or room that day gives way to another, as the admin would book it; a once-a-course one does not.
        placed: for (const th of [want, ...(once ? [] : Array.from({ length: 8 }, () => randomOf(pool)))].filter((t) => !given.has(t.id)))
        // Each resident starts the search at a different hour, so the day is spread over both halves.
        for (let ti = 0; ti < dayTimes.length; ti++) {
          const time = once ? dayTimes[ti] : dayTimes[(pi * 5 + ti) % dayTimes.length];
          // In the morning, on an empty stomach: by 11:00 at the latest.
          if (once && toMinutes(time) + th.duration_minutes > toMinutes('11:00')) break;
          const sMin = toMinutes(time);
          const eMin = sMin + th.duration_minutes;
          if (eMin > toMinutes('20:00')) continue;
          const pBusy = busy[dateKey].patient[p.id] ??= [];
          if ([...meals, ...pBusy].some((b) => overlaps(b.s, b.e, sMin, eMin))) continue;
          const staffOnLeave = staffHolidaysByDay[dateKey] || new Set<string>();
          const team = staff.filter((sc) => sc.specializations.includes(th.id) && (!th.requires_gender_match || sc.gender === p.gender) && !staffOnLeave.has(sc.id) && inHours(sc, dateKey, sMin, eMin)
            && !(busy[dateKey].staff[sc.id] || []).some((b) => overlaps(b.s, b.e, sMin, eMin))).slice(0, th.staff_required);
          if (team.length < th.staff_required) continue;
          for (let k = 0; k < rooms.length; k++) {
            const room = rooms[(pi + k) % rooms.length];
            if (!th.required_amenities.every((a) => room.amenities.includes(a))) continue;
            const rBusy = busy[dateKey].room[room.id] ??= [];
            if (rBusy.some((b) => overlaps(b.s, b.e, sMin, eMin))) continue;
            const [lead, ...co] = team;
            await prisma.appointment.create({ data: {
              patient_id: p.id, therapy_id: th.id, staff_id: lead.id, co_staff_ids: co.map((c) => c.id), room_id: room.id,
              scheduled_date: new Date(dateKey), start_time: time, duration_minutes: th.duration_minutes,
              session_number: 1, total_sessions: 1, status: dateKey < todayKey ? 'completed' : 'pending', assignment_type: 'auto',
            } });
            rBusy.push({ s: sMin, e: eMin });
            pBusy.push({ s: sMin, e: eMin });
            for (const t of team) (busy[dateKey].staff[t.id] ??= []).push({ s: sMin, e: eMin });
            given.add(th.id);
            break placed;
          }
        }
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
      if (!inHours(absent, todayKey, s, e)) return false;
      if (taken.some((b) => overlaps(b.s, b.e, s, e))) return false;
      taken.push({ s, e });
      return true;
    });
    return { own, moved };
  };
  // The one already on leave first; then whoever has least booked today and
  // runs no event, so their being away does not also empty the yoga room.
  const candidates = [onLeaveToday, ...staff
    .filter((s) => s.id !== onLeaveToday.id && ![yogaStaff.id, prayerStaff.id, eveningYoga.id, eveningPrayer.id].includes(s.id) && !offTodayIds.has(s.id))
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

  await ensureAdmin();

  // Diet plans are the centre's own content, so these are a starting set rather
  // than demo data: a fresh install has something to assign on day one, and the
  // centre edits them in the Diet tab. Upserted by name, so re-seeding does not
  // overwrite a plan someone has since changed.
  await ensureStarterDietTemplates(prisma);
  await ensureStarterCatalogues(prisma);

  // Residents. Without these the demo has nobody actually staying at the centre,
  // so the day sheet shows neither meals nor the rest-day rows — two features
  // that would look missing rather than unseeded.
  const today = centreToday();
  const templates = await prisma.dietTemplate.findMany({ orderBy: { name: 'asc' } });
  const packages = await prisma.package.findMany({ orderBy: { days: 'asc' } });
  const houses = await prisma.accommodationType.findMany({ orderBy: { price_per_day: 'asc' } });
  const DAY_MS = 86400000;
  const residents: { id: string }[] = [];
  let stayCount = 0;
  const concernsSeed = ['Lower back pain, poor sleep', 'Stress and fatigue', 'Joint stiffness in the mornings', 'Digestion, acidity', 'Weight and energy', 'Recovery after illness'];
  const purging = new Set<string>();
  const addStay = async (patient_id: string, start_date: Date, end_date: Date, on_site: boolean, purge?: string) => {
    const days = Math.round((end_date.getTime() - start_date.getTime()) / DAY_MS) + 1;
    await prisma.patientStay.create({
      data: { patient_id, start_date, end_date, on_site, duration_days: Math.round((end_date.getTime() - start_date.getTime()) / DAY_MS) + 1,
        // Most have chosen, some not yet: the card shows "Not decided yet" honestly (stories 11 and 12).
        ...(on_site && stayCount % 3 !== 2 && packages.length ? { package_id: packages.reduce((best, p) => (Math.abs(p.days - days) < Math.abs(best.days - days) ? p : best)).id } : {}),
        ...(on_site && stayCount % 4 !== 3 && houses.length ? { accommodation_id: houses[stayCount % houses.length].id } : {}),
        // Taken on arrival, so today's arrivals are the ones still to do (#219).
        ...(start_date < today ? { vitals: `BP ${118 + (stayCount * 7) % 30}/${76 + (stayCount * 3) % 14}, pulse ${66 + (stayCount * 5) % 18}`, concerns: concernsSeed[stayCount % concernsSeed.length], tests: stayCount % 4 === 0 ? 'Blood sugar (fasting), lipid profile' : null } : {}) },
    });
    // Not everyone: a centre always has someone whose plan has not been set yet,
    // and the sheet should show that honestly rather than inventing one. Only
    // those arriving today or later: a patient a day in with no plan is on the pill (#288), and a demo that opens on 16 of them is not the demo.
    // Someone not staying eats at home: no plan for a day visitor or an outpatient.
    const planned = on_site && (stayCount++ % 6 !== 5 || start_date < today) && templates.length > 0;
    if (purge) purging.add(patient_id);
    if (planned) {
      // The oleation and after-purification diets belong to a Virechana course only (#359).
      const named = (n: string) => templates.find((t) => t.name.startsWith(n));
      const usual = templates.filter((t) => !t.name.startsWith('Internal oleation') && !t.name.startsWith('After purification'));
      const base = usual[stayCount % usual.length].id;
      const oleation = named('Internal oleation'), after = named('After purification');
      const at = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS);
      // Before: the usual plan; three days of oleation; from Virechana, five days of samsarjana; then the usual plan again.
      const parts: [Date, Date, string][] = purge && oleation && after
        ? [[start_date, at(purge, -4), base], [at(purge, -3), at(purge, -1), oleation.id], [at(purge, 0), at(purge, 4), after.id], [at(purge, 5), end_date, (usual.find((t) => !t.name.startsWith('Before purification')) ?? usual[0]).id]]
        : [[start_date, end_date, base]];
      for (const [from, to, template_id] of parts) {
        const end = to > end_date ? end_date : to;
        if (from <= end) await prisma.dietPlanSegment.create({ data: { patient_id, start_date: from, end_date: end, template_id } });
      }
      // Their own medication and notes (#355): everyone on a purification is told how to eat around it, one in three others has medication.
      const told = purge ? { medication: 'Set each morning by the physician through the purification', before_treatment: "Confirm today's dose or diet step with the physician", after_treatment: 'Report nausea, heaviness or no appetite the same day' } : stayCount % 3 === 0 ? { medication: usualNotes[usual[stayCount % usual.length].name]?.medication } : null;
      if (told) await prisma.patient.update({ where: { id: patient_id }, data: told });
    }
    if (planned && start_date <= today && today <= end_date) residents.push({ id: patient_id });
  };
  for (const [patientId, list] of staysOf) {
    for (const x of list) await addStay(patientId, x.s, x.e, x.kind !== 'day' && x.kind !== 'out', purgeDay.get(x));
  }

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
  // The dense seed books every room most afternoons; then a spare one, made after the booking, takes the repair, so the leave is always there.
  const idleRoom = rooms.find((r) => !bookedAfternoon.has(r.id) && !todaysBookings.some((a) => a.room_id === r.id && afternoon(a.start_time)))
    ?? await prisma.therapyRoom.create({ data: { name: 'Annexe', amenities: amenitiesSet, weekly_schedule: scheduleStd, is_active: true } });
  await prisma.timeOff.create({ data: { entity_type: 'room', entity_id: idleRoom.id, date: today, start_time: '14:00', end_time: '20:00', description: 'Plumbing repair' } });

  // Doctors (#219): three, sharing two consultation rooms that no treatment
  // needs. Each stay opens with a consultation and has one a week after it, so
  // the card shows a last and a next, and the doctor rota has a morning on it.
  const consultation = allTherapies.find((t) => t.is_consultation)!;
  const consultRooms = await Promise.all(['Charaka', 'Sushruta'].slice(0, SIZE.doctors).map((name) => prisma.therapyRoom.create({
    data: { name, amenities: ['bp_monitor', 'examination_bed'], weekly_schedule: scheduleStd, is_active: true },
  })));
  const doctors = await Promise.all([['Dr Lakshmi Menon', 'female'], ['Dr Vikram Rao', 'male'], ['Dr Farah Siddiqui', 'female']].slice(0, SIZE.doctors).map(([name, gender]) =>
    prisma.staff.create({ data: { name, gender: gender as 'male' | 'female', role: 'doctor', specializations: [consultation.id], weekly_schedule: week('08:00', '14:00'), is_active: true, phone: `+91-7${Math.floor(100000000 + random() * 899999999)}` } })));
  const holidayKeys = new Set(centerHolidays.map((h) => h.date && h.date.toISOString().slice(0, 10)));
  const consultSlots = Array.from({ length: 12 }, (_, i) => { const m = 9 * 60 + i * 20; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; });
  const takenBy = new Map<string, Set<string>>(); // "date|time" -> doctor and room ids already booked
  const plans = [
    'Continue Abhyanga daily. Light diet, no curd at night. Review BP next week.',
    'Pain easing. Add Kati Vasti for 5 days; reduce oil in lunch.',
    'Good progress. Start Virechana preparation; ghee in the morning for 3 days.',
    'Sleep improved. Keep Shirodhara every second day; walk after dinner.',
  ];
  // Only a Virechana course is told to prepare for it (#359).
  const planFor = (pid: string) => (purging.has(pid) ? plans[2] : randomOf(plans.filter((_, i) => i !== 2)));
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
          status: past ? 'completed' : 'pending', assignment_type: 'auto', notes: past ? planFor(stay.patient_id) : null,
        } });
        takenBy.set(`${dateKey}|${time}`, new Set([...taken, doctor.id, room.id]));
        consulted ||= past;
        break;
      }
    }
    if (consulted) await prisma.patient.update({ where: { id: stay.patient_id }, data: { doctor_plan: planFor(stay.patient_id) } });
  }


  // The discharge summary (#194): a made-up centre's letterhead, the doctors'
  // credentials and signatures, BP on the treatment records, and a complete
  // summary for everyone leaving between a week ago and the day after tomorrow.
  const png = (f: string) => `data:image/png;base64,${readFileSync(new URL(`../assets/${f}`, import.meta.url)).toString('base64')}`;
  const letterhead = {
    seal_logo: png('demo-seal.png'), name_local: 'हिमालय आयुर्वेद रिट्रीट',
    registration_line: 'Registered under the Societies Registration Act, No. S-00000 of 2010',
    accreditation_line: 'Accreditation No. DEMO-2024-0001',
    phones: '+91 5966 000000, +91 90000 00000', email: 'care@himalaya-retreat.example', website: 'himalaya-retreat.example',
    footer_line: 'Himalaya Ayurveda Retreat · a demo centre, not a real place', discharge_format: 'HAR/{YYYY}/{N}',
  };
  // Before the summaries, so their numbers follow the centre's format.
  // The demo is one made-up centre whatever CENTRE_NAME says; the setup wizard renames a real one.
  const support = process.env.DEFAULT_SUPPORT_WHATSAPP ?? '420777558262';
  const centre = { support_whatsapp: support || null, patient_support_whatsapp: support || null, centre_name: 'Himalaya Ayurveda Retreat', address: 'Near the golf course, Ranikhet, Uttarakhand', logo: png('demo-logo.png') };
  await prisma.settings.upsert({ where: { id: 'singleton' }, update: { letterhead, ...centre }, create: { id: 'singleton', letterhead, ...centre, opening_time: '09:00', closing_time: '20:00' } });
  await Promise.all(doctors.map((d, i) => prisma.staff.update({ where: { id: d.id }, data: {
    qualification: ['BAMS, MD (Panchakarma)', 'BAMS, MD (Kayachikitsa)', 'BAMS'][i], reg_no: `UK-AY-${2100 + i * 37}`, signature: png(`sig-${i + 1}.png`),
  } })));
  const diagnoses: Record<string, [string, string]> = {
    'Lower back pain, poor sleep': ['Kati shool (lumbar spondylosis) with Anidra', 'Vata Kapha'],
    'Stress and fatigue': ['Manasika shrama (stress-related fatigue)', 'Vata Pitta'],
    'Joint stiffness in the mornings': ['Amavata (early inflammatory arthritis)', 'Kapha Vata'],
    'Digestion, acidity': ['Amlapitta (hyperacidity)', 'Pitta'],
    'Weight and energy': ['Sthaulya (obesity) with low energy', 'Kapha'],
    'Recovery after illness': ['Post-viral debility', 'Vata'],
  };
  const med = (name: string, dose: string, timing = 'after food', days = '') => ({ name, dose, timing, from: '', days });
  const leaving = await prisma.patientStay.findMany({
    where: { end_date: { gte: new Date(today.getTime() - 7 * DAY_MS), lte: new Date(today.getTime() + 2 * DAY_MS) }, start_date: { lt: today } },
    include: { Patient: true },
  });
  for (const [i, st] of leaving.entries()) {
    const appts = await prisma.appointment.findMany({ where: { patient_id: st.patient_id, scheduled_date: { gte: st.start_date, lte: st.end_date < today ? st.end_date : today } }, orderBy: [{ scheduled_date: 'asc' }, { start_time: 'asc' }] });
    const seen = new Set<string>();
    for (const [k, a] of appts.entries()) {
      const day = a.scheduled_date.toISOString().slice(0, 10);
      if (seen.has(day)) continue;
      seen.add(day);
      await prisma.appointment.update({ where: { id: a.id }, data: { record: { vitals: { bp: `${136 - Math.min(k, 12) - (i % 4)}/${88 - Math.min(k, 8) + (i % 3)}` } } } });
    }
    await prisma.patient.update({ where: { id: st.patient_id }, data: {
      date_of_birth: new Date(Date.UTC(1958 + (i * 7) % 40, i % 12, 1 + (i * 3) % 27)),
      email: `${st.Patient.name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
    } });
    const [diagnosis, dosha] = diagnoses[st.concerns || ''] || ['General rejuvenation (Rasayana)', 'Vata Pitta'];
    const weeks = Math.max(1, Math.round((st.end_date.getTime() - st.start_date.getTime()) / DAY_MS / 7));
    await saveDischarge(st.id, {
      registration_no: String(16000 + i * 13), address: `${12 + i} Mall Road, ${['Dehradun', 'Pune', 'Bengaluru', 'Kochi', 'Delhi'][i % 5]}`,
      country: i % 5 === 3 ? 'Germany' : 'India', passport: i % 5 === 3 ? `C${4021870 + i}` : '',
      ...(i % 2 ? { payment_amount: `Rs. ${(weeks * 31500).toLocaleString('en-IN')}.00`, payment_mode: 'Bank transfer', payment_date: st.end_date.toISOString().slice(0, 10) } : {}),
      weight: `${58 + (i * 5) % 30} kg`, bowel: 'Regular', appetite: 'Normal', sleep: i % 3 ? 'Normal' : 'Improved, 6–7 hours',
      menstrual: st.Patient.gender === 'female' ? 'Regular' : 'NA', dosha,
      diagnosis, reason: `${st.concerns}. Came for a ${weeks}-week course.`,
      investigations: st.tests ? `${st.tests}: report attached separately.` : 'None.',
      meds_stay: [med('Dashmool Kwath', '10 ml twice daily', 'after food', String(weeks * 7 - 3)), med('Tab. Yograj Guggulu', '1-X-1', 'after food', '10'), med('Cap. Ashwagandha', 'X-X-1', 'at bedtime', '10')],
      meds_home: [med('Tab. Yograj Guggulu', '1-X-1'), med('Cap. Ashwagandha', 'X-X-1', 'at bedtime'), med('Triphala churna', '1 tsp', 'warm water at night')],
      meds_home_for: '1 month',
      instructions: 'Avoid fried and oily food, curd at night, cold drinks and ice cream. Yoga and meditation 20–30 minutes a day, or walk 30 minutes.',
      follow_up: 'Please contact the centre for a consultation after 30 days.',
      urgent_when: 'Any new pain, fever, breathlessness, or if you feel unwell.',
      urgent_how: `Call the centre on ${letterhead.phones.split(',')[0]} or WhatsApp the duty doctor.`,
      final: st.end_date < today,
    }, 'admin', prisma);
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
      id: 'singleton', demo_data: true, setup_complete: true, ...centre,
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
