/**
 * Rooms taken each night (#1257): a guest's nights count on each of them and not on their leaving day.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Nightstest';

async function tidy(prisma: PrismaClient) {
  const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const get = async (path: string) => (await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const before = await get('/guest-rooms/nights?from=2031-01-10&days=4');
    const room = (await get('/guest-rooms/free?from=2031-01-10&to=2031-01-12')).find((r: { free: boolean; beds: number }) => r.free && r.beds === 1);
    await fetch(`${API_BASE}/patients`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: `${TAG} Asha`, gender: 'female', guest_room_id: room.id, stay: { start_date: '2031-01-10', end_date: '2031-01-12' } }) });
    const after = await get('/guest-rooms/nights?from=2031-01-10&days=4');
    assert.deepEqual(after.map((n: { taken: number }, i: number) => n.taken - before[i].taken), [1, 1, 0, 0], 'two nights taken, the leaving day not');
    assert.equal(after[0].rooms, after[0].taken + after[0].free + after[0].out);
    console.log('room nights: each night counted, the leaving day free');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
