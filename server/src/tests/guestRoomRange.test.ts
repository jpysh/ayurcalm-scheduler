/**
 * "Is a room free?" (#456): over a range of nights a guest room is free only when it has a
 * bed on every one of them; the night its guest leaves counts as free, and a two-bed room
 * with one guest still has a bed. Its own days in 2030, tidied afterwards. Needs API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Rangetest';

async function tidy(prisma: PrismaClient) {
  const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  await prisma.accommodationType.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const get = async (from: string, to: string) => {
      const r = await fetch(`${API_BASE}/guest-rooms/free?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` } });
      assert.ok(r.ok, `free ${from} ${to}: ${r.status}`);
      const rooms = (await r.json()) as { name: string; free: boolean; guests: { name: string }[] }[];
      return (n: string) => rooms.find((x) => x.name === `${TAG}${n}`)!;
    };
    const house = await prisma.accommodationType.create({ data: { name: `${TAG} House`, price_per_day: 1000 } });
    const [one, two] = await Promise.all([
      prisma.guestRoom.create({ data: { name: `${TAG}1`, accommodation_id: house.id } }),
      prisma.guestRoom.create({ data: { name: `${TAG}2`, accommodation_id: house.id, beds: 2 } }),
    ]);
    const stay = async (name: string, start: string, end: string, room: string) => {
      const p = await prisma.patient.create({ data: { name: `${TAG} ${name}`, gender: 'female' } });
      await prisma.patientStay.create({ data: { patient_id: p.id, start_date: new Date(`${start}T00:00:00Z`), end_date: new Date(`${end}T00:00:00Z`), duration_days: 1, accommodation_id: house.id, guest_room_id: room } });
    };
    await stay('Asha', '2030-06-12', '2030-06-15', one.id);
    await stay('Bina', '2030-06-01', '2030-06-30', two.id);

    let at = await get('2030-06-05', '2030-06-12');
    assert.equal(at('1').free, true, 'free up to the night before a guest arrives');
    at = await get('2030-06-10', '2030-06-20');
    assert.equal(at('1').free, false, 'taken on one night of the range is not free');
    assert.equal(at('1').guests[0].name, `${TAG} Asha`);
    at = await get('2030-06-15', '2030-06-26');
    assert.equal(at('1').free, true, 'the night the guest leaves is free');
    assert.equal(at('2').free, true, 'a two-bed room with one guest still has a bed');
    await stay('Chitra', '2030-06-20', '2030-06-22', two.id);
    assert.equal((await get('2030-06-15', '2030-06-26'))('2').free, false, 'both beds taken on one night is not free');
    console.log('guest room range: ok');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
