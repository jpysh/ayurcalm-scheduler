/**
 * Guest rooms (#456): "QA1–QA6" adds six rooms to a type, a name already taken is
 * refused, and a room a stay used is retired, not deleted. The demo seed puts its
 * guests in rooms, never more in one than it has beds on any night.
 *
 * Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { expandRoomNames } from '../guestRooms.js';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;

async function main() {
  assert.deepEqual(expandRoomNames('T1–T3'), ['T1', 'T2', 'T3']);
  assert.deepEqual(expandRoomNames('101-103, Hut A'), ['101', '102', '103', 'Hut A']);
  assert.deepEqual(expandRoomNames('R08-10'), ['R08', 'R09', 'R10']);

  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    const tidy = () => prisma.guestRoom.deleteMany({ where: { name: { startsWith: 'QA' } } });
    await tidy();
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const call = (method: string, path: string, body?: unknown) => fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });

    const house = await prisma.accommodationType.findFirstOrThrow({ orderBy: { price_per_day: 'asc' } });
    const made = await call('POST', '/guest-rooms', { name: 'QA1–QA6', accommodation_id: house.id, beds: 2 });
    assert.equal(made.status, 201);
    assert.equal((await made.json()).added.length, 6, 'a range adds every room in it');
    assert.equal(await prisma.guestRoom.count({ where: { name: { startsWith: 'QA' }, beds: 2, accommodation_id: house.id } }), 6);
    assert.equal((await call('POST', '/guest-rooms', { name: 'QA6', accommodation_id: house.id })).status, 409, 'a name already taken is refused');

    const room = await prisma.guestRoom.findUniqueOrThrow({ where: { name: 'QA1' } });
    const stay = await prisma.patientStay.findFirstOrThrow({ where: { guest_room_id: null } });
    await prisma.patientStay.update({ where: { id: stay.id }, data: { guest_room_id: room.id } });
    assert.equal((await (await call('DELETE', `/guest-rooms/${room.id}`)).json()).retired, true, 'a room a stay used is retired');
    await prisma.patientStay.update({ where: { id: stay.id }, data: { guest_room_id: null } });
    const spare = await prisma.guestRoom.findUniqueOrThrow({ where: { name: 'QA2' } });
    assert.equal((await (await call('DELETE', `/guest-rooms/${spare.id}`)).json()).deleted, true, 'an unused room is deleted');
    await tidy();

    // The seed: rooms with guests in them, and no night over a room's beds.
    const stays = await prisma.patientStay.findMany({ where: { guest_room_id: { not: null } }, include: { GuestRoom: true } });
    assert.ok(stays.length >= 5, `the demo should have guests in rooms, has ${stays.length}`);
    for (const s of stays) {
      const sharing = stays.filter((o) => o.guest_room_id === s.guest_room_id && o.start_date < s.end_date && s.start_date < o.end_date);
      for (let d = s.start_date.getTime(); d < s.end_date.getTime(); d += 86400000) {
        const n = sharing.filter((o) => o.start_date.getTime() <= d && d < o.end_date.getTime()).length;
        assert.ok(n <= s.GuestRoom!.beds, `${s.GuestRoom!.name} holds ${n} on ${new Date(d).toISOString().slice(0, 10)} with ${s.GuestRoom!.beds} beds`);
      }
    }
    console.log('guest rooms: ok');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
