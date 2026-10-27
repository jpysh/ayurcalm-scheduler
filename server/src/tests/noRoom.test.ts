/**
 * Staying tonight with no guest room (#1256): listed in What needs you and on the guest rooms sheet; a day patient,
 * or a guest with a room, is not.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Roomlesstest';

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
    const call = async (method: string, path: string, body?: unknown) => { const r = await fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); assert.ok(r.ok, `${method} ${path}: ${r.status}`); return r; };
    const stay = { start_date: '2030-12-04', end_date: '2030-12-08' };
    await call('POST', '/patients', { name: `${TAG} Asha`, gender: 'female', stay });
    await call('POST', '/patients', { name: `${TAG} Day`, gender: 'female', on_site: false, stay });
    const items = (await (await call('GET', '/attention?date=2030-12-05')).json()).items.filter((i: { rule: string; who: string }) => i.rule === 'no_room' && i.who.startsWith(TAG));
    assert.deepEqual(items.map((i: { who: string }) => i.who), [`${TAG} Asha`], 'the resident with no room is listed, the day patient is not');
    const pdf = Buffer.from(await (await call('GET', '/daily-schedule-pdf?date=2030-12-05&view=rooms')).arrayBuffer());
    assert.ok(pdf.length > 1000, 'the guest rooms sheet prints');
    console.log('no room: listed in What needs you, day patients left out');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
