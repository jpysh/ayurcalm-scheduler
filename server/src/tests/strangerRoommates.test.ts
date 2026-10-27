/**
 * A man and a woman not in the same booking put in one room (#1202): the room is still given, with a warning;
 * the same group, or two guests of one gender, raise none.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Roomtest';

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
    const call = async (body: unknown) => { const r = await fetch(`${API_BASE}/patients`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); assert.equal(r.status, 201, await r.clone().text()); return r.json(); };
    const house = await prisma.accommodationType.findFirstOrThrow();
    const room = await prisma.guestRoom.create({ data: { name: `${TAG}1`, accommodation_id: house.id, beds: 3 } });
    const stay = { start_date: '2030-12-01', end_date: '2030-12-05' };
    const a = await call({ name: `${TAG} Asha`, gender: 'female', guest_room_id: room.id, group_name: `${TAG} Yoga`, stay });
    assert.equal(a.warning, undefined);
    const b = await call({ name: `${TAG} Bina`, gender: 'female', guest_room_id: room.id, stay: { start_date: '2030-12-02', end_date: '2030-12-04' } });
    assert.equal(b.warning, undefined, 'two women sharing raise nothing');
    const c = await call({ name: `${TAG} Ravi`, gender: 'male', guest_room_id: room.id, group_name: `${TAG} Yoga`, stay: { start_date: '2030-12-03', end_date: '2030-12-04' } });
    assert.match(c.warning ?? '', new RegExp(`${TAG} Bina, a woman not in the same booking`), 'a man with a woman outside his booking is warned, and still saved');
    await prisma.patientStay.deleteMany({ where: { patient_id: b.id } });
    const d = await call({ name: `${TAG} Dev`, gender: 'male', guest_room_id: room.id, group_name: `${TAG} Yoga`, stay: { start_date: '2030-12-04', end_date: '2030-12-05' } });
    assert.equal(d.warning, undefined, 'the same group raises nothing');
    console.log('stranger roommates: warned, never refused; same booking or same gender raise nothing');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
