/**
 * A treatment before the arrival consultation (#1241): the booking still saves, says so, and the day check
 * lists it as a note, never a problem to fix.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Consulttest';

async function tidy(prisma: PrismaClient) {
  const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const call = async (method: string, path: string, body?: unknown) => { const r = await fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
    const p = await call('POST', '/patients', { name: `${TAG} Asha`, gender: 'female', stay: { start_date: '2030-11-04', end_date: '2030-11-10' } });
    const [consult, therapy, room] = await Promise.all([prisma.therapy.findFirstOrThrow({ where: { is_consultation: true } }), prisma.therapy.findFirstOrThrow({ where: { is_consultation: false, once_per_course: false, before_purification: false } }), prisma.therapyRoom.findFirstOrThrow()]);
    const doctor = await prisma.staff.findFirstOrThrow({ where: { is_active: true, role: 'doctor' } });
    await prisma.appointment.create({ data: { patient_id: p.body.id, therapy_id: consult.id, staff_id: doctor.id, room_id: room.id, scheduled_date: new Date('2030-11-05T00:00:00Z'), start_time: '16:00', duration_minutes: consult.duration_minutes, co_staff_ids: [], session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual' } });
    // The booking sheet warns first.
    const opts = await call('GET', `/appointments/options?date=2030-11-05&patient_id=${p.body.id}&therapy_id=${therapy.id}&at=09:00`);
    assert.ok(opts.body.warnings?.some((w: { reason: string }) => w.reason === 'BEFORE_CONSULTATION'), 'the booking sheet says so before booking');
    const t = opts.body.times?.find((x: { start_time: string }) => x.start_time < '16:00') ?? opts.body.times?.[0];
    assert.ok(t, `a morning time is offered: ${JSON.stringify(opts.body).slice(0, 200)}`);
    const booked = await call('POST', '/appointments/one', { patient_id: p.body.id, therapy_id: therapy.id, date: '2030-11-05', start_time: t.start_time, staff_id: t.staff_id, co_staff_ids: t.co_staff_ids ?? [], room_id: t.room_id ?? opts.body.rooms?.[0]?.id });
    assert.equal(booked.status, 201, `the booking still saves: ${JSON.stringify(booked.body)}`);
    assert.match(booked.body.note ?? '', /before their first consultation/, 'and says it is before the consultation');
    const check = await call('GET', '/day-check?date=2030-11-05');
    const note = check.body.problems.find((x: { kind: string; patient_id: string }) => x.kind === 'BEFORE_CONSULTATION' && x.patient_id === p.body.id);
    assert.equal(note?.problem_class, 'worth_knowing', 'the day check lists it as a note');
    console.log('before consultation: booked anyway, said at booking, a note on the day check');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
