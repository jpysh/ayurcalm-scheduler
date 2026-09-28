/**
 * Private links (#219): a therapist, doctor or resident sees and records on
 * their own treatments only, with no sign-in, and a reissued link stops the old
 * one. Builds its own day in 2030 and removes it. Needs a running server.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const DAY = '2030-03-13';
const tag = `L${Date.now()}`;

const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const admin = { Authorization: `Bearer ${login.token}` };
const call = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}${path}`, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const issue = async (kind: 'staff' | 'patients', id: string) => (await (await call(`/${kind}/${id}/link?renew=1`, {}, admin)).json()).token as string;
const shared = async (kind: 'staff' | 'patients', id: string) => (await (await call(`/${kind}/${id}/link`, {}, admin)).json()).token as string;

const therapy = await prisma.therapy.create({ data: { name: `Abhyanga ${tag}`, required_amenities: [], duration_minutes: 60, checklist: [{ text: 'Oil warmed', required: true }], vitals: ['bp', 'pulse'] } });
const consult = await prisma.therapy.create({ data: { name: `Consultation ${tag}`, required_amenities: [], duration_minutes: 20, is_consultation: true } });
const therapist = await prisma.staff.create({ data: { name: `Asha ${tag}`, gender: 'female', specializations: [therapy.id], weekly_schedule: {} } });
const other = await prisma.staff.create({ data: { name: `Meera ${tag}`, gender: 'female', specializations: [therapy.id], weekly_schedule: {} } });
const doctor = await prisma.staff.create({ data: { name: `Dr ${tag}`, gender: 'female', role: 'doctor', specializations: [consult.id], weekly_schedule: {} } });
const patient = await prisma.patient.create({ data: { name: `Rekha ${tag}`, gender: 'female' } });
const book = (therapy_id: string, staff_id: string, start_time: string) => prisma.appointment.create({ data: {
  patient_id: patient.id, therapy_id, staff_id, scheduled_date: new Date(DAY), start_time,
  duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual',
} });
const mineA = await book(therapy.id, therapist.id, '10:00');
const theirs = await book(therapy.id, other.id, '12:00');
const visit = await book(consult.id, doctor.id, '09:00');

try {
  assert.equal((await call('/public/link/not-a-real-token-at-all-xyz')).status, 404, 'an unknown link is refused, without a sign-in prompt');
  assert.equal((await call(`/staff/${therapist.id}/link`, {})).status, 401, 'issuing a link needs the admin');

  const t = await issue('staff', therapist.id);
  const day = await (await call(`/public/link/${t}?date=${DAY}`)).json();
  assert.equal(day.who.kind, 'therapist');
  assert.deepEqual(day.items.map((i: { id: string }) => i.id), [mineA.id], 'a therapist sees their own treatments only');
  assert.deepEqual(day.items[0].checklist, [{ text: 'Oil warmed', required: true, done: false }]);

  assert.equal((await call(`/public/link/${t}/appointments/${mineA.id}`, { checklist: { 'Oil warmed': true, 'Invented': true }, vitals: { bp: '130/85', weight: '70' }, room_ready: true })).status, 200);
  const rec = (await prisma.appointment.findUnique({ where: { id: mineA.id } }))!.record as Record<string, any>;
  assert.deepEqual(rec.checklist, { 'Oil warmed': true }, 'only the therapy\'s own checklist is kept');
  assert.deepEqual(rec.vitals, { bp: '130/85' }, 'only the therapy\'s own vitals are kept');
  assert.equal(rec.room_ready, true);
  assert.equal((await call(`/public/link/${t}/appointments/${theirs.id}`, { room_ready: true })).status, 404, 'not someone else\'s treatment');
  assert.equal((await call(`/public/link/${t}/appointments/${mineA.id}`, { note: 'x' })).status, 403, 'only a doctor writes the note');
  assert.equal((await call(`/public/link/${t}/issues`, { kind: 'room', appointment_id: mineA.id, note: 'Steam not working' })).status, 201);

  const d = await issue('staff', doctor.id);
  assert.equal((await call(`/public/link/${d}/appointments/${visit.id}`, { note: 'Continue for a week' })).status, 200);
  assert.equal((await prisma.appointment.findUnique({ where: { id: visit.id } }))!.notes, 'Continue for a week', 'the doctor\'s note is the consultation\'s note');

  const p = await issue('patients', patient.id);
  const own = await (await call(`/public/link/${p}?date=${DAY}`)).json();
  assert.equal(own.items.length, 3, 'a resident sees their whole day');
  assert.equal(own.items[0].checklist, undefined, 'and nothing the staff record');
  assert.equal((await call(`/public/link/${p}/appointments/${mineA.id}`, { feedback: 'down', feedback_note: 'Too hot' })).status, 200);
  assert.ok((await call(`/public/link/${p}/appointments/${mineA.id}`, { room_ready: true })).status >= 400, 'a resident cannot record for staff');
  assert.equal((await call(`/public/link/${p}/issues`, { kind: 'sos' })).status, 403);

  assert.equal(await shared('staff', therapist.id), t, 'sharing again sends the same link');
  const t2 = await issue('staff', therapist.id);
  assert.equal((await call(`/public/link/${t}?date=${DAY}`)).status, 404, 'a reissued link stops the old one');
  assert.equal((await call(`/public/link/${t2}?date=${DAY}`)).status, 200);
  console.log('links: ok');
} finally {
  await prisma.linkIssue.deleteMany({ where: { staff_id: { in: [therapist.id, doctor.id] } } });
  await prisma.appointment.deleteMany({ where: { id: { in: [mineA.id, theirs.id, visit.id] } } });
  await prisma.patient.delete({ where: { id: patient.id } });
  await prisma.staff.deleteMany({ where: { id: { in: [therapist.id, other.id, doctor.id] } } });
  await prisma.therapy.deleteMany({ where: { id: { in: [therapy.id, consult.id] } } });
  await prisma.$disconnect();
}
