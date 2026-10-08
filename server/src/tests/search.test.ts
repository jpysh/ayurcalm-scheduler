/**
 * Search across days (#165): a resident's name finds their treatments on every
 * day in the window, in date order; a room's or an assisting therapist's name
 * finds them too; a cancelled treatment and a day outside the window do not.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Searchtest';

async function tidy(prisma: PrismaClient) {
  const patients = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patient.deleteMany({ where: { id: { in: patients } } });
  await prisma.staff.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapyRoom.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.guestRoom.deleteMany({ where: { name: { startsWith: TAG } } });
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
    const search = async (q: string, from = '2030-05-01', to = '2030-05-31') => {
      const res = await fetch(`${API_BASE}/appointments/search?q=${encodeURIComponent(q)}&from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` } });
      assert.ok(res.ok, `search ${q}: ${res.status}`);
      return (await res.json()).hits as { id: string; date: string; patient_name: string; staff_names: string[] }[];
    };

    const therapy = await prisma.therapy.create({ data: { name: `${TAG} Abhyanga`, duration_minutes: 60 } });
    const [lead, helper] = await Promise.all(['Lata', 'Mina'].map((n) => prisma.staff.create({ data: { name: `${TAG} ${n}`, gender: 'female', specializations: [therapy.id], weekly_schedule: {} } })));
    const room = await prisma.therapyRoom.create({ data: { name: `${TAG} Kailash`, weekly_schedule: {} } });
    const rekha = await prisma.patient.create({ data: { name: `${TAG} Rekha Zorawar`, gender: 'female' } });
    const book = (date: string, start_time: string, status: 'pending' | 'cancelled' = 'pending', co: string[] = []) => prisma.appointment.create({ data: {
      patient_id: rekha.id, therapy_id: therapy.id, staff_id: lead.id, co_staff_ids: co, room_id: room.id, scheduled_date: new Date(`${date}T00:00:00.000Z`),
      start_time, duration_minutes: 60, session_number: 1, total_sessions: 3, status, assignment_type: 'manual',
    } });
    const later = await book('2030-05-20', '10:00');
    const earlier = await book('2030-05-05', '15:00', 'pending', [helper.id]);
    await book('2030-05-10', '11:00', 'cancelled');
    await book('2030-07-01', '11:00');

    const byName = await search('zorawar');
    assert.deepEqual(byName.map((h) => h.id), [earlier.id, later.id], 'a resident\'s name should find both days in the window, in date order, without the cancelled one or the day outside');
    assert.equal(byName[0].date, '2030-05-05');
    assert.deepEqual(byName[0].staff_names, [lead.name, helper.name]);
    assert.deepEqual((await search(`${TAG} Kailash`)).map((h) => h.id), [earlier.id, later.id], 'a room\'s name should find its treatments');
    assert.deepEqual((await search(`${TAG} Mina`)).map((h) => h.id), [earlier.id], 'an assisting therapist should find what they assist on');
    assert.equal((await search('zorawar', '2030-06-01', '2030-07-31')).length, 1, 'the window should bound the days searched');

    // A past guest is a patient row, so their card can be reached to book them again (#412).
    await prisma.patientStay.create({ data: { patient_id: rekha.id, start_date: new Date('2030-04-01T00:00:00.000Z'), end_date: new Date('2030-04-10T00:00:00.000Z'), duration_days: 10 } });
    const guest = await prisma.patient.create({ data: { name: `${TAG} Ravi Zorawar`, gender: 'male' } });
    const house = await prisma.accommodationType.findFirstOrThrow({ orderBy: { name: 'asc' } });
    const bedroom = await prisma.guestRoom.create({ data: { name: `${TAG} S-2`, accommodation_id: house.id } });
    await prisma.patientStay.create({ data: { patient_id: guest.id, start_date: new Date('2030-05-10T00:00:00.000Z'), end_date: new Date('2030-05-20T00:00:00.000Z'), duration_days: 11, accommodation_id: house.id, guest_room_id: bedroom.id } });
    const res = await fetch(`${API_BASE}/appointments/search?q=zorawar&from=2030-05-01&to=2030-05-31`, { headers: { Authorization: `Bearer ${token}` } });
    const people = (await res.json()).patients as { id: string; when: string; room: string | null; end: string | null }[];
    assert.deepEqual(people.map((p) => [p.id, p.when]), [[guest.id, 'in'], [rekha.id, 'past']], 'patients come first in house, then past guests');
    assert.equal(people[0].room, `${house.name} ${TAG} S-2`, 'a guest in house shows their guest room');
    assert.equal(people[1].end, '2030-04-10');
    // A guest room's name and a country find the guest too (#525).
    await prisma.patient.update({ where: { id: guest.id }, data: { country: 'Germany' } });
    const byRoom = (await (await fetch(`${API_BASE}/appointments/search?q=${encodeURIComponent(TAG + ' S-2')}&from=2030-05-01&to=2030-05-31`, { headers: { Authorization: `Bearer ${token}` } })).json()).patients as { id: string }[];
    assert.deepEqual(byRoom.map((p) => p.id), [guest.id], 'a guest room finds who sleeps in it');
    const byCountry = (await (await fetch(`${API_BASE}/appointments/search?q=germany&from=2030-05-01&to=2030-05-31`, { headers: { Authorization: `Bearer ${token}` } })).json()).patients as { id: string }[];
    assert.ok(byCountry.some((p) => p.id === guest.id), 'a country finds the guest');

    console.log('Search: a name finds every day in the window, in order; rooms and assisting therapists count; cancelled and out-of-window do not.');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
