/**
 * A group's days short of therapists (#1242): with all but one therapist on leave, a group of six is short that
 * day and not the day after.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Captest';

async function tidy(prisma: PrismaClient) {
  const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  await prisma.timeOff.deleteMany({ where: { description: TAG } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const call = async (method: string, path: string, body?: unknown) => { const r = await fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); assert.ok(r.ok, `${method} ${path}: ${r.status} ${await r.clone().text()}`); return r.json(); };
    const GROUP = `${TAG} Retreat`;
    for (const n of ['A', 'B', 'C', 'D', 'E', 'F']) await call('POST', '/patients', { name: `${TAG} ${n}`, gender: 'female', group_name: GROUP, stay: { start_date: '2030-12-16', end_date: '2030-12-17' } });
    const [keep, ...away] = await prisma.staff.findMany({ where: { is_active: true, role: 'therapist' } });
    assert.ok(keep);
    await prisma.timeOff.createMany({ data: away.map((s) => ({ entity_type: 'staff' as const, entity_id: s.id, date: new Date('2030-12-16T00:00:00Z'), description: TAG })) });
    const short = await call('GET', `/groups/capacity?name=${encodeURIComponent(GROUP)}`);
    assert.deepEqual(short.map((d: { date: string }) => d.date), ['2030-12-16'], 'short on the day nearly everyone is away, not the day after');
    assert.equal(short[0].guests, 6);
    console.log('group capacity: the short day named, the full team day not');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
