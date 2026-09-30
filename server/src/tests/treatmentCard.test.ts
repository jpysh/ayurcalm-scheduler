/**
 * The treatment card's lists and history (#136).
 *
 * Every time, therapist and room the card offers saves without a refusal, a
 * therapist busy elsewhere is not offered, a resident who didn't come frees
 * their therapist, and History says what changed in words.
 *
 * Its own day in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Cardtest';
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

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }),
    })).json();
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
      assert.ok(res.ok, `${method} ${path}: ${res.status} ${await res.clone().text()}`);
      return res.json();
    };

    const therapy = await call('POST', '/therapies', { name: `${TAG} Abhyanga`, duration_minutes: 60 });
    const [asha, bina] = [await call('POST', '/staff', { name: `${TAG} Asha`, gender: 'female', specializations: [therapy.id], weekly_schedule: allWeek }),
      await call('POST', '/staff', { name: `${TAG} Bina`, gender: 'female', specializations: [therapy.id], weekly_schedule: allWeek })];
    const [roomA, roomB] = [await call('POST', '/rooms', { name: `${TAG} Room A`, weekly_schedule: allWeek }), await call('POST', '/rooms', { name: `${TAG} Room B`, weekly_schedule: allWeek })];
    const resident = (name: string) => call('POST', '/patients', { name: `${TAG} ${name}`, gender: 'female', stay: { start_date: '2030-04-10', end_date: '2030-04-20' } });
    const [rekha, sita] = [await resident('Rekha'), await resident('Sita')];
    const book = (patient_id: string, staff_id: string, room_id: string) => prisma.appointment.create({ data: {
      patient_id, therapy_id: therapy.id, staff_id, room_id, scheduled_date: new Date(`${DAY}T00:00:00.000Z`), start_time: '10:00',
      duration_minutes: 60, session_number: 1, total_sessions: 3, status: 'pending', assignment_type: 'manual',
    } });
    const mine = await book(rekha.id, asha.id, roomA.id);
    const theirs = await book(sita.id, bina.id, roomB.id);

    const choices = async (kind: string) => (await call('GET', `/appointments/${mine.id}/choices?kind=${kind}`)).choices as { label: string; now?: boolean; change: Record<string, unknown> }[];
    const staffNames = async () => (await choices('staff')).filter((c) => !c.now).map((c) => c.label);
    assert.ok(!(await staffNames()).includes(bina.name), 'a therapist busy at that time was offered');

    // Every list starts with the treatment as it stands, marked now (#201).
    for (const kind of ['time', 'staff', 'room', 'therapy']) {
      const [first] = (await choices(kind)) as { now?: boolean; label: string }[];
      assert.ok(first?.now, `${kind}'s first row is not the current one: ${first?.label}`);
    }
    // When offers another room and another day, not only later in the same room (#201).
    const when = await choices('time');
    assert.ok(when.some((c) => c.change.room_id), 'When offers no other room');
    assert.ok(when.some((c) => c.change.scheduled_date), 'When offers no other day');
    assert.ok(!when.some((c) => String(c.change.scheduled_date || '') > '2030-04-20'), 'When offers a day after the stay ends');

    // Every option saves: the list and the guard agree.
    for (const kind of ['time', 'room']) {
      const list = await choices(kind);
      assert.ok(list.length > 1, `no ${kind} offered on an empty day`);
      for (const c of list) {
        await call('PUT', `/appointments/${mine.id}`, c.change);
        await call('PUT', `/appointments/${mine.id}`, { scheduled_date: DAY, start_time: '10:00', room_id: roomA.id });
      }
    }

    // Sita didn't come: Bina is free for Rekha's treatment.
    await call('PUT', `/appointments/${theirs.id}`, { status: 'no_show' });
    assert.ok((await staffNames()).includes(bina.name), "a resident who didn't come still holds their therapist");
    const toBina = (await choices('staff')).find((c) => c.label === bina.name)!;
    await call('PUT', `/appointments/${mine.id}`, toBina.change);

    const history = (await call('GET', `/appointments/${mine.id}/history`)).entries as { text: string }[];
    assert.equal(history[0].text, `Therapist changed from ${asha.name} to ${bina.name}`, `History's latest line: ${history[0]?.text}`);
    assert.equal(history[history.length - 1].text, 'Booked: session 1 of 3');
    const sitas = (await call('GET', `/appointments/${theirs.id}/history`)).entries as { text: string }[];
    assert.equal(sitas[0].text, "Marked didn't come");

    // Booking from +: the suggested slot books, and the same slot again is refused by the guard.
    const suggested = ((await call('GET', `/appointments/suggest?date=${DAY}`)).suggestions as { patient_id: string; therapy_id: string; start_time: string; staff_id: string; room_id: string }[])
      .find((x) => x.patient_id === rekha.id || x.patient_id === sita.id);
    assert.ok(suggested, 'nobody staying was suggested for an almost empty day');
    const one = { patient_id: suggested.patient_id, therapy_id: suggested.therapy_id, date: DAY, start_time: suggested.start_time, staff_id: suggested.staff_id, room_id: suggested.room_id };
    await call('POST', '/appointments/one', one);
    const again = await fetch(`${API_BASE}/appointments/one`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(one) });
    assert.equal(again.status, 409, 'the same slot booked twice was not refused');

    // "Someone else…" (#273 H2): one chosen resident and therapy gets three different free times, each of which books.
    const times = (await call('GET', `/appointments/suggest?date=${DAY}&patient_id=${sita.id}&therapy_id=${therapy.id}`)).suggestions as typeof suggested[];
    assert.equal(times.length, 3, `expected three times for the chosen resident, got ${times.length}`);
    assert.ok(times.every((x) => x.patient_id === sita.id && x.therapy_id === therapy.id), 'a time for someone else was offered');
    assert.equal(new Set(times.map((x) => x.start_time)).size, 3, 'the three times are not different');
    await call('POST', '/appointments/one', { patient_id: sita.id, therapy_id: therapy.id, date: DAY, start_time: times[2].start_time, staff_id: times[2].staff_id, room_id: times[2].room_id });

    // A therapy given by two (#273): each time comes with its second therapist, books with her, and is refused without her.
    const pair = await call('POST', '/therapies', { name: `${TAG} Pizhichil`, duration_minutes: 60, staff_required: 2 });
    for (const s of [asha, bina]) await call('PUT', `/staff/${s.id}`, { specializations: [therapy.id, pair.id] });
    const together = (await call('GET', `/appointments/suggest?date=${DAY}&patient_id=${rekha.id}&therapy_id=${pair.id}`)).suggestions as (typeof one & { co_staff_ids: string[]; staff_name: string })[];
    assert.ok(together.length > 0, 'no time was offered for a two-therapist therapy');
    assert.deepEqual([together[0].staff_id, ...together[0].co_staff_ids].sort(), [asha.id, bina.id].sort(), 'the time did not pair both therapists');
    assert.match(together[0].staff_name, / and /, 'the time does not name both therapists');
    const two = { patient_id: rekha.id, therapy_id: pair.id, date: DAY, start_time: together[0].start_time, staff_id: together[0].staff_id, room_id: together[0].room_id };
    const alone = await fetch(`${API_BASE}/appointments/one`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(two) });
    assert.equal((await alone.json()).reason, 'STAFF_SHORT', 'a two-therapist therapy booked with one therapist was not refused');
    const booked = await call('POST', '/appointments/one', { ...two, co_staff_ids: together[0].co_staff_ids });
    assert.deepEqual(booked.co_staff_ids, together[0].co_staff_ids, 'the second therapist was not saved on the booking');

    console.log("Treatment card: every time and room offered saves, a busy therapist isn't offered, a no-show frees theirs, and History says what changed; a suggested booking saves once and not twice; a chosen resident gets three free times; a two-therapist therapy books with both.");
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
