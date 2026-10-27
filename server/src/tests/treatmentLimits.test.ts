/**
 * What the doctor ruled out (#1254): a booking on a guest's Vamana day, or of a therapy not for them, is refused
 * with a plain reason; a consultation on that day, and other therapies, still book.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Limitstest';

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
    const raw = (method: string, path: string, body?: unknown) => fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const p = await (await raw('POST', '/patients', { name: `${TAG} Asha`, gender: 'female', stay: { start_date: '2030-11-04', end_date: '2030-11-12' } })).json();
    const [solo, other, consult] = await Promise.all([
      prisma.therapy.findFirstOrThrow({ where: { is_consultation: false, staff_required: 1, once_per_course: false, before_purification: false }, orderBy: { name: 'asc' } }),
      prisma.therapy.findFirstOrThrow({ where: { is_consultation: false, staff_required: 1, once_per_course: false, before_purification: false }, orderBy: { name: 'desc' } }),
      prisma.therapy.findFirstOrThrow({ where: { is_consultation: true } }),
    ]);
    assert.equal((await raw('PUT', `/patients/${p.id}`, { treatment_limits: { rest_days: [{ date: '2030-11-06', why: 'Vamana' }], not_for: [{ therapy_id: solo.id, why: 'high BP' }] } })).status, 200);
    const book = async (therapy: string, date: string) => {
      const o = await (await raw('GET', `/appointments/options?date=${date}&patient_id=${p.id}&therapy_id=${therapy}`)).json();
      const t = o.times?.[0];
      return { offered: !!t, res: t ? await raw('POST', '/appointments/one', { patient_id: p.id, therapy_id: therapy, date, start_time: t.start_time, staff_id: t.staff_id, co_staff_ids: t.co_staff_ids ?? [], room_id: t.room_id ?? o.rooms?.[0]?.id, confirm: true }) : null, why: o };
    };
    const rest = await book(other.id, '2030-11-06');
    assert.equal(rest.offered, false, 'no time is offered on the Vamana day');
    const notFor = await book(solo.id, '2030-11-07');
    assert.equal(notFor.offered, false, 'no time is offered for a therapy not for her');
    const fine = await book(other.id, '2030-11-07');
    assert.equal(fine.res?.status, 201, 'another therapy on another day still books');
    // The guard itself, as any other route would meet it.
    const staff = await prisma.staff.findFirstOrThrow({ where: { is_active: true, role: 'doctor' } });
    const room = await prisma.therapyRoom.findFirstOrThrow();
    const direct = await raw('POST', '/appointments/one', { patient_id: p.id, therapy_id: solo.id, date: '2030-11-08', start_time: '10:00', staff_id: staff.id, co_staff_ids: [], room_id: room.id, confirm: true });
    const why = await direct.json();
    assert.equal(why.reason, 'NOT_FOR_PATIENT', JSON.stringify(why));
    assert.match(why.message, /is not for Limitstest: high BP\./);
    const visit = await book(consult.id, '2030-11-06');
    assert.ok(visit.offered, 'the consultation on the Vamana day is still offered');
    console.log('treatment limits: rest day and not-for-them refused with a reason; the consultation still books');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
