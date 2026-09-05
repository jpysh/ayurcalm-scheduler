import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } from './auth.js';

const prisma = new PrismaClient();

const ayurvedaRoomNames = [
  'Dhanvantari', 'Ashwini Kumar East', 'Ashwini Kumar West', 'Lord Shiva', 'Lord Vishnu', 'Lakshmi', 'Parvati', 'Ganesha',
  'Hanuman', 'Saraswati', 'Surya', 'Chandra', 'Agni', 'Vayu', 'Indra', 'Varuna', 'Kubera', 'Yama', 'Brahma', 'Narada'
];

const amenitiesSet = ['massage_table','shower','steam','herbal_oil','shirodhara_stand','dhara_stand','rice_boluses','herbal_paste'];

const therapyDefs = [
  { name: 'Abhyanga', req: ['massage_table','herbal_oil'], dur: 60, gender: false },
  { name: 'Shirodhara', req: ['shirodhara_stand','massage_table'], dur: 90, gender: true },
  { name: 'Panchakarma', req: ['steam','massage_table','shower'], dur: 120, gender: true },
  { name: 'Nasya', req: ['massage_table'], dur: 45, gender: false },
  { name: 'Pizhichil', req: ['massage_table','shower'], dur: 75, gender: true },
  { name: 'Udvartana', req: ['massage_table','herbal_paste'], dur: 60, gender: false },
  { name: 'Njavarakizhi', req: ['massage_table','rice_boluses'], dur: 90, gender: true },
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

function randomOf<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }
function toMinutes(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function overlaps(aS: number, aE: number, bS: number, bE: number) { return Math.max(aS, bS) < Math.min(aE, bE); }

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
  for (let i = 0; i < 120; i++) patients.push(`${randomOf(firstNames)} ${randomOf(surnames)}`);

  const createdPatients = await Promise.all(patients.map((name, idx) => prisma.patient.create({
    data: { name, gender: idx % 2 === 0 ? 'male' : 'female', phone: `+91-9${Math.floor(100000000 + Math.random()*899999999)}` },
  })));

  const therapies = await Promise.all(therapyDefs.map(t => prisma.therapy.create({
    data: { name: t.name, required_amenities: t.req, duration_minutes: t.dur, requires_gender_match: t.gender },
  })));

  const scheduleStd = { sunday: { start: '09:00', end: '18:00' }, monday: { start: '09:00', end: '18:00' }, tuesday: { start: '09:00', end: '18:00' }, wednesday: { start: '09:00', end: '18:00' }, thursday: { start: '09:00', end: '18:00' }, friday: { start: '09:00', end: '18:00' }, saturday: { start: '09:00', end: '18:00' } };

  const rooms = await Promise.all(ayurvedaRoomNames.map((rn) => prisma.therapyRoom.create({
    data: { name: rn, amenities: amenitiesSet.slice(0, 4), weekly_schedule: scheduleStd, is_active: true },
  })));

  const staffNames = ['Dr. Priya','Dr. Raj','Dr. Anjali','Dr. Kumar','Dr. Neha','Dr. Ravi','Dr. Asha','Dr. Suresh','Dr. Meera','Dr. Arvind','Dr. Pooja','Dr. Kiran','Dr. Alok','Dr. Varsha','Dr. Manish','Dr. Bhavna','Dr. Rohit','Dr. Trisha','Dr. Dev','Dr. Kriti'];
  const staff = await Promise.all(staffNames.map((n, idx) => prisma.staff.create({
    data: {
      name: `${n} ${randomOf(surnames)}`,
      gender: idx % 2 === 0 ? 'female' : 'male',
      phone: `+91-8${Math.floor(100000000 + Math.random()*899999999)}`,
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
  const startRange = new Date();
  const endRange = new Date(startRange);
  endRange.setMonth(endRange.getMonth() + 3);
  function isBusinessDay(d: Date) { const day = d.getDay(); return day >= 1 && day <= 5; }
  for (const s of staff) {
    let count = 0;
    const used: Set<string> = new Set();
    while (count < 5) {
      const d = new Date(startRange);
      d.setDate(d.getDate() + Math.floor(Math.random() * 90));
      const key = d.toISOString().slice(0,10);
      if (!isBusinessDay(d) || used.has(key)) continue;
      used.add(key);
      await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: s.id, date: d, description: 'Personal Leave' } });
      count++;
    }
  }

  // Create appointments for next 3 months targeting ~30% capacity on business days
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 3);
  const dayTimes = ['09:00','10:30','12:00','13:30','15:00'];
  const busy: Record<string, { staff: Record<string, { s: number; e: number }[]>; room: Record<string, { s: number; e: number }[]>; patient: Record<string, { s: number; e: number }[]> }> = {};
  const centerHolidays = await prisma.timeOff.findMany({ where: { entity_type: 'center', date: { gte: start, lte: end } } });
  const staffHolidaysByDay: Record<string, Set<string>> = {};
  for (const h of await prisma.timeOff.findMany({ where: { entity_type: 'staff', date: { gte: start, lte: end } } })) {
    if (!h.date) continue;
    const key = h.date.toISOString().slice(0,10);
    staffHolidaysByDay[key] ??= new Set<string>();
    if (h.entity_id) staffHolidaysByDay[key].add(h.entity_id);
  }
  const todayKey = new Date().toISOString().slice(0, 10);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const weekday = d.getDay();
    const dateKey = d.toISOString().slice(0,10);
    // Skip weekends, except today — a fresh install seeded on a Saturday
    // would otherwise open on an empty schedule.
    if ((weekday === 0 || weekday === 6) && dateKey !== todayKey) continue;
    if (centerHolidays.some(h => h.date && h.date.toISOString().slice(0,10) === dateKey)) continue;
    busy[dateKey] ??= { staff: {}, room: {}, patient: {} };
    // heuristic capacity: aim ~2 slots per room per day for 30% (assuming ~6 possible)
    for (const r of rooms) {
      const rDay = (scheduleStd as any)[['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][weekday]];
      if (!rDay) continue;
      let slotsCreatedForRoom = 0;
      for (const time of dayTimes) {
        if (slotsCreatedForRoom >= 2) break;
        const th = randomOf(therapies);
        if (!th.required_amenities.every(a => r.amenities.includes(a))) continue;
        const p = randomOf(createdPatients);
        const sCandidates = staff.filter(s => s.specializations.includes(th.id) && (!th.requires_gender_match || s.gender === p.gender));
        // skip if staff holiday
        const staffOnLeave = staffHolidaysByDay[dateKey] || new Set<string>();
        const s = sCandidates.find(sc => !staffOnLeave.has(sc.id));
        if (!s) continue;
        const sMin = toMinutes(time);
        const eMin = sMin + th.duration_minutes;
        const rBusy = busy[dateKey].room[r.id] ??= [];
        const sBusy = busy[dateKey].staff[s.id] ??= [];
        const pBusy = busy[dateKey].patient[p.id] ??= [];
        const conflict = rBusy.some(b => overlaps(b.s, b.e, sMin, eMin)) || sBusy.some(b => overlaps(b.s, b.e, sMin, eMin)) || pBusy.some(b => overlaps(b.s, b.e, sMin, eMin));
        if (conflict) continue;
        await prisma.appointment.create({ data: {
          patient_id: p.id,
          therapy_id: th.id,
          staff_id: s.id,
          room_id: r.id,
          scheduled_date: new Date(dateKey),
          start_time: time,
          duration_minutes: th.duration_minutes,
          session_number: 1,
          total_sessions: 1,
          status: 'pending',
          assignment_type: 'auto',
        } });
        rBusy.push({ s: sMin, e: eMin });
        sBusy.push({ s: sMin, e: eMin });
        pBusy.push({ s: sMin, e: eMin });
        slotsCreatedForRoom++;
      }
    }
  }

  // Program Events — Weekly schedule for All Guests
  const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  await prisma.programEvent.create({ data: { recurrence: 'weekly', weekdays, start_time: '07:30', end_time: '08:30', activity_name: 'Yoga', room_id: null, staff_id: null, required_amenities: [], notes: 'All Guests', audience: 'all' } });
  await prisma.programEvent.create({ data: { recurrence: 'weekly', weekdays, start_time: '08:30', end_time: '09:00', activity_name: 'Breakfast', room_id: null, staff_id: null, required_amenities: [], notes: 'Diet per plan', audience: 'all' } });
  await prisma.programEvent.create({ data: { recurrence: 'weekly', weekdays, start_time: '13:00', end_time: '13:30', activity_name: 'Lunch', room_id: null, staff_id: null, required_amenities: [], notes: '', audience: 'patients', patients_scope: 'all' } });
  await prisma.programEvent.create({ data: { recurrence: 'weekly', weekdays, start_time: '18:30', end_time: '19:00', activity_name: 'Dinner', room_id: null, staff_id: null, required_amenities: [], notes: '', audience: 'patients', patients_scope: 'all' } });
  await prisma.programEvent.create({ data: { recurrence: 'weekly', weekdays, start_time: '17:00', end_time: '18:00', activity_name: 'Evening Meditation', room_id: null, staff_id: null, required_amenities: [], notes: '', audience: 'all' } });
  await prisma.programEvent.create({ data: { recurrence: 'weekly', weekdays: ['monday'], start_time: '08:00', end_time: '08:30', activity_name: 'Temple Prayers', room_id: null, staff_id: null, required_amenities: [], notes: '', audience: 'all' } });

  const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1); nextMonth.setDate(10);
  for (let i = 0; i < 4; i++) {
    const d = new Date(nextMonth); d.setDate(nextMonth.getDate() + i * 5);
    await prisma.programEvent.create({ data: { date: d, start_time: '10:00', end_time: '11:00', activity_name: `Special Session ${i+1}`, room_id: null, staff_id: null, required_amenities: [], audience: 'all', notes: '', patients_scope: 'all' } });
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

  // Flags this install as carrying demo data, so Settings can offer to clear it.
  await prisma.settings.upsert({
    where: { id: 'singleton' },
    update: { demo_data: true },
    create: { id: 'singleton', demo_data: true, centre_name: process.env.CENTRE_NAME || 'Wellness Centre' },
  });

  console.log('Seeded extended AyurCalm dataset successfully');
}

main().finally(async () => {
  prisma.$disconnect();
});
