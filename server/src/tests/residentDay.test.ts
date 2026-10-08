/**
 * The resident card's day (#63): the stay it falls in and which day of it,
 * today's treatments without the cancelled one, and meals as the day sheet
 * resolves them, a meal written for today winning over the plan.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Residenttest';
const DAY = '2030-06-12';

async function tidy(prisma: PrismaClient) {
  const patients = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.dietPlan.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.dietPlanSegment.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patient.deleteMany({ where: { id: { in: patients } } });
  await prisma.therapy.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.dietTemplate.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }),
    })).json();

    const at = (d: string) => new Date(`${d}T00:00:00.000Z`);
    const therapy = await prisma.therapy.create({ data: { name: `${TAG} Abhyanga`, duration_minutes: 60 } });
    const plan = await prisma.dietTemplate.create({ data: { name: `${TAG} Vata`, therapy_breakfast: 'Rice kanji', therapy_lunch: 'Khichdi', therapy_dinner: 'Moong soup' } });
    const rekha = await prisma.patient.create({ data: { name: `${TAG} Rekha`, gender: 'female' } });
    await prisma.patientStay.create({ data: { patient_id: rekha.id, start_date: at('2030-06-10'), end_date: at('2030-06-19'), duration_days: 10 } });
    await prisma.dietPlanSegment.create({ data: { patient_id: rekha.id, start_date: at('2030-06-10'), end_date: at('2030-06-19'), template_id: plan.id } });
    await prisma.dietPlan.create({ data: { patient_id: rekha.id, date: at(DAY), meal_time: 'lunch', description: 'Rice gruel only', created_by: 'test' } });
    const book = (start_time: string, status: 'pending' | 'cancelled' | 'no_show') => prisma.appointment.create({ data: {
      patient_id: rekha.id, therapy_id: therapy.id, scheduled_date: at(DAY), start_time, duration_minutes: 60,
      session_number: 1, total_sessions: 3, status, assignment_type: 'manual',
    } });
    const late = await book('15:00', 'pending');
    await book('11:00', 'cancelled');
    const missed = await book('09:00', 'no_show');
    const ahead = await prisma.appointment.create({ data: {
      patient_id: rekha.id, therapy_id: therapy.id, scheduled_date: at('2030-06-14'), start_time: '10:00', duration_minutes: 60,
      session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual',
    } });

    const res = await fetch(`${API_BASE}/patients/${rekha.id}/day?date=${DAY}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.ok(res.ok, `GET day: ${res.status}`);
    const d = await res.json();
    assert.deepEqual(d.stay && [d.stay.start_date, d.stay.end_date, d.stay.day, d.stay.days], ['2030-06-10', '2030-06-19', 3, 10]);
    assert.deepEqual(d.treatments.map((t: { id: string }) => t.id), [missed.id, late.id], 'today\'s treatments in time order, the cancelled one left out');
    assert.deepEqual(d.week.map((w: { date: string; treatments: { id: string }[] }) => [w.date, w.treatments.map((t) => t.id)]), [
      ['2030-06-12', [missed.id, late.id]], ['2030-06-13', []], ['2030-06-14', [ahead.id]], ['2030-06-15', []], ['2030-06-16', []], ['2030-06-17', []], ['2030-06-18', []],
    ], 'the next seven days, an empty one shown as empty (#350)');
    assert.equal(d.plan_name, plan.name);
    assert.deepEqual(d.meals, [
      { meal: 'Breakfast', text: 'Rice kanji' }, { meal: 'Lunch', text: 'Rice gruel only' }, { meal: 'Dinner', text: 'Moong soup' },
    ], 'meals as the day sheet resolves them, today\'s written lunch first');

    // After they leave (#437): no week of empty days to flag, and when they left.
    const gone = await (await fetch(`${API_BASE}/patients/${rekha.id}/day?date=2030-06-25`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal(gone.stay, null);
    assert.deepEqual(gone.week, [], 'a past guest has no next days to book');
    assert.equal(gone.last_stay?.end_date, '2030-06-19');

    // Before they arrive (#495): the stay that is coming is on the card, so Stay edits it and the guest is not "not staying".
    const early = await (await fetch(`${API_BASE}/patients/${rekha.id}/day?date=2030-06-08`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal(early.stay, null);
    assert.deepEqual([early.coming?.start_date, early.coming?.end_date], ['2030-06-10', '2030-06-19']);
    assert.equal(early.last_stay, null, 'a guest who is coming is not a past guest');
    // The Patients list asks for the next two weeks as well, so a guest added ahead is on it (#496).
    const names = async (q: string) => ((await (await fetch(`${API_BASE}/patients?resident_on=2030-06-08${q}`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { name: string }[]).map((x) => x.name);
    assert.ok(!(await names('')).includes(rekha.name), 'in house only, by default');
    assert.ok((await names('&arriving_within=14')).includes(rekha.name), 'arriving within 14 days');
    assert.ok(!(await names('&arriving_within=1')).includes(rekha.name), 'not arriving within a day');

    console.log("Resident day: which day of the stay, today's treatments without the cancelled one, and meals as the sheet prints them.");
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
