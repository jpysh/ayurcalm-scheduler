/**
 * Guest room tags (#1201): a room marked "ground floor" says so wherever a room is chosen.
 *
 * Needs a running server: API_BASE. Tidies its own room.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Tagtest';

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await prisma.guestRoom.deleteMany({ where: { name: { startsWith: TAG } } });
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const call = async (method: string, path: string, body?: unknown) => { const r = await fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); assert.ok(r.ok, `${method} ${path}: ${r.status} ${await r.clone().text()}`); return r.json(); };
    const house = await prisma.accommodationType.findFirstOrThrow({ where: { is_active: true } });
    await call('POST', '/guest-rooms', { name: `${TAG}1`, accommodation_id: house.id });
    const id = (await prisma.guestRoom.findUniqueOrThrow({ where: { name: `${TAG}1` } })).id;
    await call('PUT', `/guest-rooms/${id}`, { tags: ['ground floor', 'quiet'] });
    const room = (await call('GET', '/guest-rooms/free?from=2030-12-20&to=2030-12-22')).find((r: { id: string }) => r.id === id);
    assert.deepEqual(room.tags, ['ground floor', 'quiet'], 'the room picker gets the tags');
    console.log('room tags: saved and given with the free rooms');
  } finally {
    await prisma.guestRoom.deleteMany({ where: { name: { startsWith: TAG } } }).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
