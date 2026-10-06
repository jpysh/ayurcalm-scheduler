/**
 * Plan next week (#354, story 14): this week's therapies repeat a week on, at their
 * times where the guard allows; a swap changes one line; Book all books every line
 * and the next review, or nothing at all.
 *
 * Its own fortnight in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Nextweek';
const REVIEW = '2030-05-08';
const allWeek = Object.fromEntries(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]));
const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const day = (n: number) => new Date(Date.parse(`${REVIEW}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function tidy(prisma: PrismaClient) {
  const patients = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patient.deleteMany({ where: { id: { in: patients } } });
  await prisma.staff.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapyRoom.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapy.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const raw = (method: string, path: string, body?: unknown) => fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const call = async (method: string, path: string, body?: unknown) => { const res = await raw(method, path, body); assert.ok(res.ok, `${method} ${path}: ${res.status} ${await res.clone().text()}`); return res.json(); };

    const amen = ['nextweek_table'];
    const therapy = (name: string, extra = {}) => call('POST', '/therapies', { name: `${TAG} ${name}`, duration_minutes: 60, required_amenities: amen, ...extra });
    const [abhy, shiro, kati, nowhere] = [await therapy('Abhyanga'), await therapy('Shirodhara'), await therapy('Kati Basti'), await therapy('Nowhere', { required_amenities: ['nextweek_no_room_has_this'] })];
    const consult = await call('POST', '/therapies', { name: `${TAG} Consultation`, duration_minutes: 30, is_consultation: true });
    const asha = await call('POST', '/staff', { name: `${TAG} Asha`, gender: 'female', specializations: [abhy.id, shiro.id, kati.id, nowhere.id], weekly_schedule: allWeek });
    const doc = await call('POST', '/staff', { name: `${TAG} Dr Rao`, gender: 'female', role: 'doctor', specializations: [], weekly_schedule: allWeek });
    const room = await call('POST', '/rooms', { name: `${TAG} Room`, amenities: amen, weekly_schedule: allWeek });
    const croom = await call('POST', '/rooms', { name: `${TAG} Consult room`, amenities: [], weekly_schedule: allWeek });
    const p = await call('POST', '/patients', { name: `${TAG} Meera`, gender: 'female', stay: { start_date: day(-7), end_date: day(12) } });

    // This week: Abhyanga daily at 09:00, Shirodhara on two days at 11:00, the review on the review day.
    const book = (therapy_id: string, d: string, start_time: string, staff_id: string, room_id: string, minutes = 60) =>
      prisma.appointment.create({ data: { patient_id: p.id, therapy_id, scheduled_date: at(d), start_time, duration_minutes: minutes, staff_id, room_id, co_staff_ids: [], session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual' } });
    for (let n = -6; n <= 0; n++) await book(abhy.id, day(n), '09:00', asha.id, room.id);
    await book(shiro.id, day(-4), '11:00', asha.id, room.id);
    await book(shiro.id, day(-2), '11:00', asha.id, room.id);
    await book(consult.id, REVIEW, '10:00', doc.id, croom.id, 30);

    const plan = await call('GET', `/patients/${p.id}/next-week?date=${REVIEW}`);
    const line = (id: string) => plan.lines.find((l: { from_therapy_id: string }) => l.from_therapy_id === id);
    assert.equal(plan.lines.length, 2, 'two lines: Abhyanga and Shirodhara');
    assert.deepEqual(line(abhy.id).sessions.map((s: { date: string }) => s.date), [1, 2, 3, 4, 5, 6, 7].map(day), 'Abhyanga daily, a week on');
    assert.ok(line(abhy.id).sessions.every((s: { start_time: string }) => s.start_time === '09:00'), 'Abhyanga keeps its time');
    assert.deepEqual(line(shiro.id).sessions.map((s: { date: string }) => s.date), [day(3), day(5)], 'Shirodhara on the same weekdays');
    assert.equal(plan.review?.date, day(7)); assert.equal(plan.review?.start_time, '10:00');

    const mine = () => prisma.appointment.count({ where: { patient_id: p.id, scheduled_date: { gt: at(REVIEW) } } });
    // A line that cannot be placed refuses the whole week: nothing is booked.
    const refused = await raw('POST', `/patients/${p.id}/next-week`, { date: REVIEW, lines: [{ from_therapy_id: abhy.id, therapy_id: abhy.id }, { from_therapy_id: shiro.id, therapy_id: nowhere.id }] });
    assert.equal(refused.status, 409);
    assert.match((await refused.json()).message, /Nothing was booked/);
    assert.equal(await mine(), 0, 'a refused week left bookings behind');

    // Swap Shirodhara for Kati Basti and book all: seven, two and the review.
    const ok = await call('POST', `/patients/${p.id}/next-week`, { date: REVIEW, lines: [{ from_therapy_id: abhy.id, therapy_id: abhy.id }, { from_therapy_id: shiro.id, therapy_id: kati.id }] });
    assert.equal(ok.count, 10);
    assert.equal(await mine(), 10);
    assert.equal(await prisma.appointment.count({ where: { patient_id: p.id, therapy_id: kati.id } }), 2, 'the swap booked Kati Basti');
    // Planned twice, nothing doubles: a day that already has the therapy is left as it is.
    const again = await call('GET', `/patients/${p.id}/next-week?date=${REVIEW}`);
    assert.equal(again.lines.find((l: { from_therapy_id: string }) => l.from_therapy_id === abhy.id).sessions.length, 0, 'a second plan proposed Abhyanga again');
    assert.equal(again.review, null);
    // Undo is deleting what was made; the week is clear again.
    for (const id of ok.ids) assert.equal((await raw('DELETE', `/appointments/${id}`)).status, 204);
    assert.equal(await mine(), 0);

    console.log('Plan next week: this week repeats a week on at its times, a swap changes one line, and Book all books every line and the review or nothing.');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
