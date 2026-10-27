/**
 * A tentative hold (#1203): a room kept for a phone enquiry shows as taken until its last day, then is free again.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Holdtest';

async function tidy(prisma: PrismaClient) {
  await prisma.groupHold.deleteMany({ where: { group_name: { startsWith: TAG } } });
  await prisma.guestRoom.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.accommodationType.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const call = async (method: string, path: string, body?: unknown) => { const r = await fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); assert.ok(r.ok, `${method} ${path}: ${r.status} ${await r.clone().text()}`); return r.json(); };
    const hut = await prisma.accommodationType.create({ data: { name: `${TAG} Hut`, price_per_day: 1 } });
    await prisma.guestRoom.create({ data: { name: `${TAG}1`, accommodation_id: hut.id } });
    const free = async () => (await call('GET', '/guest-rooms/free?from=2030-12-10&to=2030-12-14')).filter((r: { type: string; free: boolean }) => r.type === hut.name && r.free).length;
    const name = `${TAG} Sharma enquiry`;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    await call('PUT', '/groups/hold', { name, start_date: '2030-12-10', end_date: '2030-12-14', rooms: [{ accommodation_id: hut.id, rooms: 1 }], keep_until: today });
    assert.equal(await free(), 0, 'kept for the enquiry until its last day');
    const g = (await call('GET', '/groups')).find((x: { name: string }) => x.name === name);
    assert.deepEqual([g.holds[0].keep_until, g.holds[0].lapsed], [today, false]);
    await prisma.groupHold.updateMany({ where: { group_name: name }, data: { keep_until: new Date('2020-01-01T00:00:00Z') } });
    assert.equal(await free(), 1, 'after its last day the room is free again');
    assert.equal((await call('GET', '/groups')).find((x: { name: string }) => x.name === name).holds[0].lapsed, true, 'and the group says it lapsed');
    console.log('tentative hold: taken until its last day, then free again');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
