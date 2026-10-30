/**
 * Remove from the patient card (#1362): someone with nothing on record is deleted
 * for good; anyone with a given treatment is archived instead. Archived, they keep
 * the past, lose what is ahead, leave the lists, and search finds them to restore.
 * Admin only. A fixed past day and a fixed day in 2030. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Rmtest';
const PAST = '2020-08-14';
const AHEAD = '2030-08-14';
const staffEmail = 'rmtest-staff@example.com';

async function tidy(prisma: PrismaClient) {
  const patients = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patient.deleteMany({ where: { id: { in: patients } } });
  await prisma.user.deleteMany({ where: { email: staffEmail } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const login = async (email: string, password: string) => ({ Authorization: `Bearer ${(await (await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    })).json()).token}`, 'Content-Type': 'application/json' });
    const admin = await login('admin@example.com', 'demo1234');
    const post = (path: string, body: object = {}, headers = admin) => fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });

    const therapy = await prisma.therapy.findFirstOrThrow();
    const kept = await prisma.patient.create({ data: { name: `${TAG} Kept`, gender: 'female' } });
    const book = (day: string, status: 'completed' | 'confirmed') => prisma.appointment.create({ data: {
      patient_id: kept.id, therapy_id: therapy.id, scheduled_date: new Date(`${day}T00:00:00.000Z`),
      start_time: '10:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status, assignment_type: 'manual',
    } });
    const done = await book(PAST, 'completed');
    await book(AHEAD, 'confirmed');
    const stay = await prisma.patientStay.create({ data: { patient_id: kept.id, start_date: new Date(`${PAST}T00:00:00Z`), end_date: new Date(`${AHEAD}T00:00:00Z`), duration_days: 3653 } });

    await prisma.user.create({ data: { email: staffEmail, name: 'Staff', role: 'staff', password_hash: (await prisma.user.findFirstOrThrow({ where: { email: 'admin@example.com' } })).password_hash } });
    assert.equal((await post(`/patients/${kept.id}/remove`, {}, await login(staffEmail, 'demo1234'))).status, 403, 'staff cannot remove a patient');
    assert.equal((await post(`/patients/${kept.id}/remove`, { check: 'yes' })).status, 400, 'the body is checked');

    assert.deepEqual(await (await post(`/patients/${kept.id}/remove`, { check: true })).json(), { will: 'archive', ahead: 1 }, 'a done treatment means archive, and the one ahead is named');
    assert.ok(await prisma.patient.findUnique({ where: { id: kept.id, archived_at: null } }), 'checking changes nothing');
    assert.deepEqual(await (await post(`/patients/${kept.id}/remove`)).json(), { done: 'archive' });
    const left = await prisma.appointment.findMany({ where: { patient_id: kept.id } });
    assert.deepEqual(left.map((a) => a.id), [done.id], 'the done treatment is kept, the one ahead cancelled');
    const cut = await prisma.patientStay.findUniqueOrThrow({ where: { id: stay.id } });
    assert.ok(cut.end_date < new Date(`${AHEAD}T00:00:00Z`) && cut.end_date >= cut.start_date, 'the stay ends before today');
    const list = await (await fetch(`${API_BASE}/patients`, { headers: admin })).json() as { id: string }[];
    assert.ok(!list.some((p) => p.id === kept.id), 'off the patients list');
    const found = await (await fetch(`${API_BASE}/patients/find?q=${TAG}&date=${AHEAD}`, { headers: admin })).json() as { patients: { id: string; archived: boolean }[] };
    assert.equal(found.patients.find((p) => p.id === kept.id)?.archived, true, 'search finds them, marked removed');

    assert.equal((await post(`/patients/${kept.id}/restore`)).status, 204);
    assert.ok(await prisma.patient.findUnique({ where: { id: kept.id, archived_at: null } }), 'restored');
    assert.equal((await post(`/patients/${kept.id}/restore`)).status, 404, 'restoring twice is refused');

    const blank = await prisma.patient.create({ data: { name: `${TAG} Blank`, gender: 'male', created_at: new Date(`${PAST}T00:00:00Z`) } });
    assert.equal((await (await post(`/patients/${blank.id}/remove`, { check: true })).json()).will, 'delete', 'nothing on record: delete');
    assert.equal((await post(`/patients/${blank.id}/remove`)).status, 200);
    assert.equal(await prisma.patient.findUnique({ where: { id: blank.id } }), null, 'deleted for good');
    console.log('PASS removePatient');
  } finally {
    await tidy(prisma);
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
