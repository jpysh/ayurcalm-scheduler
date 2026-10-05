/**
 * Booking from + (#330): the daily limit and a repeated therapy are asked about
 * and booked on "Book anyway", and every refusal carries a way forward.
 *
 * Its own day in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Bookrules';
const DAY = '2030-04-17';
const allWeek = Object.fromEntries(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]));

async function tidy(prisma: PrismaClient) {
  const patients = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  const appts = (await prisma.appointment.findMany({ where: { patient_id: { in: patients } }, select: { id: true } })).map((a) => a.id);
  await prisma.auditLog.deleteMany({ where: { entity_id: { in: appts } } });
  await prisma.appointment.deleteMany({ where: { id: { in: appts } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patient.deleteMany({ where: { id: { in: patients } } });
  await prisma.staff.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapyRoom.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapy.deleteMany({ where: { name: { startsWith: TAG } } });
}

type Act = { kind: string; label: string; date?: string; start_time?: string; gender?: string; therapy_id?: string };

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }),
    })).json();
    const raw = (method: string, path: string, body?: unknown) =>
      fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await raw(method, path, body);
      assert.ok(res.ok, `${method} ${path}: ${res.status} ${await res.clone().text()}`);
      return res.json();
    };
    const options = (patient: string, therapy: string, date = DAY, now = '') => call('GET', `/appointments/options?date=${date}&patient_id=${patient}&therapy_id=${therapy}${now ? `&now=${now}` : ''}`);

    const [abhyanga, shiro, solo, vamana] = [
      await call('POST', '/therapies', { name: `${TAG} Abhyanga`, duration_minutes: 60 }),
      await call('POST', '/therapies', { name: `${TAG} Shirodhara`, duration_minutes: 60 }),
      await call('POST', '/therapies', { name: `${TAG} Solo`, duration_minutes: 60 }),
      await call('POST', '/therapies', { name: `${TAG} Vamana`, duration_minutes: 60, requires_gender_match: true }),
    ];
    const staff = (name: string, gender: string, specializations: string[]) => call('POST', '/staff', { name: `${TAG} ${name}`, gender, specializations, weekly_schedule: allWeek });
    const [asha, bina, sole] = [await staff('Asha', 'female', [abhyanga.id, shiro.id]), await staff('Bina', 'female', [abhyanga.id, shiro.id]), await staff('Sole', 'female', [solo.id])];
    await staff('Ravi', 'male', [vamana.id]);
    const [roomA, roomB, roomS] = [await call('POST', '/rooms', { name: `${TAG} Room A`, weekly_schedule: allWeek }), await call('POST', '/rooms', { name: `${TAG} Room B`, weekly_schedule: allWeek }), await call('POST', '/rooms', { name: `${TAG} Room S`, weekly_schedule: allWeek })];
    const resident = (name: string) => call('POST', '/patients', { name: `${TAG} ${name}`, gender: 'female', stay: { start_date: '2030-04-10', end_date: '2030-04-20' } });
    const [meera, gita] = [await resident('Meera'), await resident('Gita')];
    const day = new Date(`${DAY}T00:00:00.000Z`);
    const put = (patient_id: string, therapy_id: string, start_time: string, staff_id: string, room_id: string, duration_minutes = 60) => prisma.appointment.create({ data: {
      patient_id, therapy_id, staff_id, room_id, scheduled_date: day, start_time, duration_minutes, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual',
    } });
    const bookBody = (patient_id: string, t: { id: string }, o: { times: { start_time: string; staff_id: string; room_id: string }[] }, i = 0) =>
      ({ patient_id, therapy_id: t.id, date: DAY, start_time: o.times[i].start_time, staff_id: o.times[i].staff_id, room_id: o.times[i].room_id });

    // Normal: a fresh day warns of nothing, and books without being asked twice.
    const clean = await options(meera.id, shiro.id);
    assert.deepEqual(clean.warnings, [], 'a fresh day carries a warning');
    assert.ok(clean.times.length > 0, 'a fresh day has no time');

    // The therapy list carries facts, and the last therapy had is the repeat.
    await prisma.appointment.create({ data: { patient_id: meera.id, therapy_id: abhyanga.id, staff_id: asha.id, room_id: roomA.id, scheduled_date: new Date('2030-04-15T00:00:00.000Z'), start_time: '10:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'completed', assignment_type: 'manual' } });
    const facts = (await call('GET', `/appointments/therapies?date=${DAY}&patient_id=${meera.id}`)).therapies as { id: string; fact?: string; repeat: boolean; taken: boolean }[];
    assert.equal(facts.find((t) => t.id === abhyanga.id)?.fact, 'had 15 Apr');
    assert.ok(facts.find((t) => t.id === abhyanga.id)?.repeat, 'the last therapy had is not marked as the repeat');
    assert.equal(facts.filter((t) => t.repeat).length, 1);

    // Same therapy twice in a day: asked, then booked on confirm.
    await put(gita.id, abhyanga.id, '09:00', asha.id, roomA.id);
    const twice = await options(gita.id, abhyanga.id);
    assert.equal(twice.warnings[0]?.reason, 'SAME_THERAPY', 'the same therapy twice was not flagged by the options');
    const again = bookBody(gita.id, abhyanga, twice);
    const asked = await raw('POST', '/appointments/one', again);
    const askedBody = await asked.json();
    assert.equal(asked.status, 409);
    assert.equal(askedBody.reason, 'SAME_THERAPY');
    assert.match(askedBody.message, /already has .*at 09:00/);
    assert.ok((askedBody.actions as Act[]).some((a) => a.kind === 'book_anyway'), 'no Book anyway offered');
    assert.equal((await prisma.appointment.count({ where: { patient_id: gita.id } })), 1, 'it was booked before being confirmed');
    assert.equal((await call('POST', '/appointments/one', { ...again, confirm: true })).day_count, 2, 'the booked panel is not told how full the day is');

    // Over the daily limit: four booked, the fifth is asked about, and then booked.
    for (const [i, t] of ['10:00', '11:00', '12:00', '13:00'].entries()) await put(meera.id, i % 2 ? shiro.id : abhyanga.id, t, i % 2 ? bina.id : asha.id, i % 2 ? roomB.id : roomA.id);
    const full = await options(meera.id, shiro.id);
    assert.ok(full.warnings.some((w: { reason: string }) => w.reason === 'DAY_FULL'), 'four treatments did not flag the day');
    const fifth = bookBody(meera.id, shiro, full);
    const stop = await raw('POST', '/appointments/one', fifth);
    assert.equal((await stop.json()).reason, 'DAY_FULL');
    assert.equal(await prisma.appointment.count({ where: { patient_id: meera.id, scheduled_date: day } }), 4);
    await call('POST', '/appointments/one', { ...fifth, confirm: true });
    assert.equal(await prisma.appointment.count({ where: { patient_id: meera.id, scheduled_date: day } }), 5);

    // The day check lists the long day as a note, not a warning.
    const check = await call('GET', `/day-check?date=${DAY}`);
    const note = (check.problems as { kind: string; problem_class: string; patient_id: string }[]).find((p) => p.kind === 'DAY_FULL' && p.patient_id === meera.id);
    assert.equal(note?.problem_class, 'worth_knowing', 'a day over the limit is not a note in the day check');

    // Dead end 1: not staying that day. Go to a day they are here, or change the stay.
    const away = await options(meera.id, shiro.id, '2030-04-25');
    assert.match(away.why, /Their stay runs Wed 10 Apr to Sat 20 Apr/);
    assert.deepEqual((away.actions as Act[]).map((a) => a.kind), ['set_date', 'change_stay']);
    assert.equal(away.actions[0].date, '2030-04-20');
    const awayBook = await raw('POST', '/appointments/one', { ...bookBody(meera.id, shiro, full), date: '2030-04-25' });
    assert.equal(awayBook.status, 409);
    assert.ok(((await awayBook.json()).actions as Act[]).length > 0, 'a refusal for a day outside the stay has no way forward');

    // Dead end 2: no free time that day. The next free day is offered, booked in one tap.
    await put(gita.id, solo.id, '09:00', sole.id, roomS.id, 540);
    const none = await options(meera.id, solo.id);
    assert.equal(none.times.length, 0);
    const [next, other] = none.actions as Act[];
    assert.equal(next.kind, 'book_at');
    assert.equal(next.date, '2030-04-18');
    assert.equal(next.start_time, '09:00');
    assert.match(next.label, /Book Thu 18 Apr at 09:00/);
    assert.equal(other.kind, 'other_therapy');
    const moved = await options(meera.id, solo.id, next.date);
    assert.equal(moved.times[0].start_time, next.start_time, 'the next free day offered a time that is not there');

    // Dead end 3: today's hours are over. Tomorrow is offered.
    const late = await options(meera.id, shiro.id, DAY, '17:30');
    assert.equal(late.times.length, 0);
    assert.match(late.why, /Today's hours are over/);
    assert.match(late.actions[0].label, /Book tomorrow at/);

    // Dead end 4: not enough therapists of the patient's gender. Add one, or allow any.
    const gender = await options(meera.id, vamana.id);
    assert.equal(gender.times.length, 0);
    const kinds = (gender.actions as Act[]).map((a) => a.kind);
    assert.deepEqual(kinds, ['add_staff', 'allow_any_gender', 'other_therapy']);
    assert.equal(gender.actions[0].gender, 'female');
    assert.equal(gender.actions[1].therapy_id, vamana.id);
    await call('PUT', `/therapies/${vamana.id}`, { requires_gender_match: false });
    assert.ok((await options(meera.id, vamana.id)).times.length > 0, 'allowing any gender did not open a time');

    console.log('Booking from +: a repeated therapy or a fifth treatment is asked about and books on Book anyway; the day check notes it; each dead end (not staying, no free time, hours over, gender short) carries an action.');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
