/**
 * A double let as a single (#1253): the guest takes every bed, so the room is not offered as free and nobody else is
 * put in; it cannot be taken whole while someone else sleeps in it.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Wholetest';

async function tidy(prisma: PrismaClient) {
  const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  await prisma.guestRoom.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const raw = (method: string, path: string, body?: unknown) => fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const house = await prisma.accommodationType.findFirstOrThrow({ where: { is_active: true } });
    const [dbl, dbl2] = await Promise.all([1, 2].map((n) => prisma.guestRoom.create({ data: { name: `${TAG}${n}`, accommodation_id: house.id, beds: 2 } })));
    const stay = { start_date: '2030-12-10', end_date: '2030-12-14' };
    const a = await (await raw('POST', '/patients', { name: `${TAG} Asha`, gender: 'female', guest_room_id: dbl.id, stay })).json();
    const room = async () => (await (await raw('GET', '/guest-rooms/free?from=2030-12-10&to=2030-12-14')).json()).find((r: { id: string }) => r.id === dbl.id);
    assert.equal((await room()).free, true, 'one guest in a double leaves a bed free');
    assert.equal((await raw('PUT', `/patients/${a.id}/stays/${a.Stays[0].id}`, { ...stay, guest_room_id: dbl.id, whole_room: true })).status, 200);
    assert.equal((await room()).free, false, 'the whole room for her: no bed free');
    const b = await raw('POST', '/patients', { name: `${TAG} Bina`, gender: 'female', guest_room_id: dbl.id, stay: { start_date: '2030-12-11', end_date: '2030-12-12' } });
    assert.equal((await b.json()).reason, 'ROOM_TAKEN', 'nobody else is put in with her');
    // Two already in a double: neither can take it whole.
    const c = await (await raw('POST', '/patients', { name: `${TAG} Chitra`, gender: 'female', guest_room_id: dbl2.id, stay })).json();
    await raw('POST', '/patients', { name: `${TAG} Dev`, gender: 'female', guest_room_id: dbl2.id, stay: { start_date: '2030-12-12', end_date: '2030-12-14' } });
    const whole = await raw('PUT', `/patients/${c.id}/stays/${c.Stays[0].id}`, { ...stay, guest_room_id: dbl2.id, whole_room: true });
    assert.equal(whole.status, 409);
    assert.equal((await whole.json()).reason, 'ROOM_SHARED');
    console.log('whole room: no bed offered, nobody put in, refused while shared');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
