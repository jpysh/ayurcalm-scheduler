/**
 * A companion (#1195): a spouse or carer who sleeps and eats here and takes no treatments. Saved as
 * one, and never asked for a discharge summary, while a guest leaving the same day is.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Companiontest';

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
    const call = async (method: string, path: string, body?: unknown) => { const r = await fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); assert.ok(r.ok, `${method} ${path}: ${r.status} ${await r.clone().text()}`); return r.json(); };
    const carer = await call('POST', '/patients', { name: `${TAG} Carer`, gender: 'male', companion: true, stay: { start_date: '2030-07-01', end_date: '2030-07-08' } });
    assert.equal(carer.Stays[0].companion, true, 'saved as a companion');
    await call('POST', '/patients', { name: `${TAG} Guest`, gender: 'female', stay: { start_date: '2030-07-01', end_date: '2030-07-08' } });
    const { items }: { items: { rule: string; who: string }[] } = await call('GET', '/attention?date=2030-07-08');
    const leaving = items.filter((i) => i.rule === 'leaves_today').map((i) => i.who);
    assert.ok(leaving.includes(`${TAG} Guest`), 'the guest owes a discharge summary');
    assert.ok(!leaving.includes(`${TAG} Carer`), 'the companion does not');
    console.log('companion: saved as one, never asked for a discharge summary');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
