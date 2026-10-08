/**
 * The new-patient and booking sheets' server side (#285 stories 4 to 6).
 *
 * A new patient is saved with their details, a day-patient flag and a
 * consultation pre-booked in a free doctor slot through the same guard as any
 * booking (a slot that is taken, or outside the stay, saves nothing). The
 * booking sheet's lists put free therapists and rooms first and keep busy ones,
 * with why. Patient search finds by name and by diet plan.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Newpatienttest';
const DAY = '2030-05-08';
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
    const raw = (method: string, path: string, body?: unknown) => fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await raw(method, path, body);
      assert.ok(res.ok, `${method} ${path}: ${res.status} ${await res.clone().text()}`);
      return res.json();
    };
    const stay = { start_date: '2030-05-06', end_date: '2030-05-12' };

    // Story 4: details, day patient, consultation pre-booked.
    const { slots } = await call('GET', `/consultations/next?date=${DAY}`);
    assert.ok(slots.length >= 2, 'a doctor is free on an empty day');
    assert.ok(slots.every((s: { date: string }) => s.date === DAY), 'the first day with a free doctor is the arrival day');
    const first = slots[0];
    const visit = { date: first.date, start_time: first.start_time, staff_id: first.staff_id, room_id: first.room_id };
    const a = await call('POST', '/patients', { name: `${TAG} Meera`, gender: 'female', stay, on_site: false, address: '4 Hill Road', country: 'India', id_number: 'P1234567', registration_number: 'R-9', consultation: visit });
    assert.equal(a.address, '4 Hill Road');
    assert.equal(a.registration_number, 'R-9');
    assert.equal(a.Stays[0].on_site, false, 'a day patient is stored as one');
    const booked = await prisma.appointment.findMany({ where: { patient_id: a.id } });
    assert.equal(booked.length, 1, 'one consultation was booked');
    assert.equal(booked[0].start_time, first.start_time);
    assert.equal(booked[0].staff_id, first.staff_id);

    const again = await raw('POST', '/patients', { name: `${TAG} Second`, gender: 'male', stay, consultation: visit });
    assert.equal(again.status, 409, 'the same doctor and room at the same time is refused');
    assert.equal(await prisma.patient.count({ where: { name: `${TAG} Second` } }), 0, 'a refused booking saves no patient');
    const outside = await raw('POST', '/patients', { name: `${TAG} Third`, gender: 'male', stay, consultation: { ...visit, date: '2030-05-20' } });
    assert.equal(outside.status, 409, 'a consultation outside the stay is refused');
    const next = (await call('GET', `/consultations/next?date=${DAY}`)).slots[0];
    assert.notDeepEqual([next.start_time, next.staff_id, next.room_id], [first.start_time, first.staff_id, first.room_id], 'the slot just taken is not offered again');
    const plain = await call('POST', '/patients', { name: `${TAG} Plain`, gender: 'male', stay });
    assert.equal(plain.Stays[0].on_site, true, 'on site is the default');
    assert.equal(await prisma.appointment.count({ where: { patient_id: plain.id } }), 0, 'no consultation unless asked for');

    // #575: a returning guest's New stay can start in a consultation, through the same guard.
    const back = await call('POST', '/patients', { name: `${TAG} Back`, gender: 'female', stay: { start_date: '2030-04-01', end_date: '2030-04-07' } });
    const slotBack = (await call('GET', `/consultations/next?date=2030-05-20`)).slots[0];
    const newStay = { start_date: '2030-05-20', end_date: '2030-05-26', consultation: { date: slotBack.date, start_time: slotBack.start_time, staff_id: slotBack.staff_id, room_id: slotBack.room_id } };
    await call('POST', `/patients/${back.id}/stays`, newStay);
    assert.equal(await prisma.appointment.count({ where: { patient_id: back.id } }), 1, 'a new stay with a consultation books it');
    const clash = await raw('POST', `/patients/${plain.id}/stays`, { ...newStay, start_date: '2030-05-20', end_date: '2030-05-26' });
    assert.equal(clash.status, 409, 'the taken doctor time is refused');
    assert.equal(await prisma.patientStay.count({ where: { patient_id: plain.id, start_date: new Date('2030-05-20T00:00:00.000Z') } }), 0, 'a refused consultation saves no stay');
    await call('POST', `/patients/${back.id}/stays`, { start_date: '2030-06-20', end_date: '2030-06-26' });
    assert.equal(await prisma.appointment.count({ where: { patient_id: back.id } }), 1, 'no consultation unless asked for');

    // Story 5: free first, busy kept with why.
    const therapy = await call('POST', '/therapies', { name: `${TAG} Abhyanga`, duration_minutes: 60 });
    const [asha, bina] = [await call('POST', '/staff', { name: `${TAG} Asha`, gender: 'female', specializations: [therapy.id], weekly_schedule: allWeek }),
      await call('POST', '/staff', { name: `${TAG} Bina`, gender: 'female', specializations: [therapy.id], weekly_schedule: allWeek })];
    const [roomA, roomB] = [await call('POST', '/rooms', { name: `${TAG} Room A`, weekly_schedule: allWeek }), await call('POST', '/rooms', { name: `${TAG} Room B`, weekly_schedule: allWeek })];
    const ida = await call('POST', '/patients', { name: `${TAG} Ida`, gender: 'female', stay });
    await prisma.appointment.create({ data: { patient_id: plain.id, therapy_id: therapy.id, staff_id: asha.id, room_id: roomA.id, scheduled_date: new Date(`${DAY}T00:00:00.000Z`), start_time: '09:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual' } });
    const o = await call('GET', `/appointments/options?date=${DAY}&patient_id=${ida.id}&therapy_id=${therapy.id}&at=09:00`);
    assert.equal(o.times[0].start_time, '09:00');
    const ofAsha = o.staff.find((s: { id: string }) => s.id === asha.id), ofBina = o.staff.find((s: { id: string }) => s.id === bina.id);
    assert.equal(ofAsha.free, false, 'a therapist with a treatment then is listed, busy');
    assert.equal(ofAsha.why, 'has a treatment');
    assert.equal(ofBina.free, true);
    assert.ok(o.staff.indexOf(ofBina) < o.staff.indexOf(ofAsha), 'free therapists come first');
    assert.equal(o.rooms.find((r: { id: string }) => r.id === roomA.id).free, false, 'a room in use then is busy');
    const who = await call('GET', `/appointments/who?date=${DAY}`);
    assert.ok(who.none.length <= 5, 'at most five suggestions');
    assert.ok(who.none.some((p: { id: string }) => p.id === ida.id), 'someone with nothing booked is offered');
    assert.ok(!who.none.some((p: { id: string }) => p.id === plain.id), 'someone already booked that day is not');
    assert.ok(who.all.some((p: { id: string }) => p.id === plain.id), 'search still reaches them');

    // Story 6: search by name.
    const found = await call('GET', `/patients/find?q=${TAG.toLowerCase()}%20meer&date=${DAY}`);
    assert.equal(found.patients.length, 1);
    assert.equal(found.patients[0].stay.end, '2030-05-12');
    console.log('New patient, booking sheet and patient search checks passed');
    await tidy(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
