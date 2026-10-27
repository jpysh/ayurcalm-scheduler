/**
 * A stay that has already ended (#1252): asked once, saved when the admin says so. A year typed wrong is the usual cause.
 *
 * Needs a running server: API_BASE. Tidies its own patient.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Pasttest';

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
    const raw = (path: string, body: unknown) => fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const p = await (await raw('/patients', { name: `${TAG} Asha`, gender: 'female' })).json();
    const first = await raw(`/patients/${p.id}/stays`, { start_date: '2020-12-20', end_date: '2020-12-27' });
    assert.equal(first.status, 409);
    const why = await first.json();
    assert.equal(why.reason, 'STAY_IN_PAST');
    assert.match(why.message, /20 Dec 2020 to 27 Dec 2020/, 'the year is said, so a typo shows');
    assert.equal(await prisma.patientStay.count({ where: { patient_id: p.id } }), 0, 'nothing saved on the first tap');
    assert.equal((await raw(`/patients/${p.id}/stays`, { start_date: '2020-12-20', end_date: '2020-12-27', confirm: true })).status, 201, 'saved when the admin says so');
    assert.equal((await raw(`/patients/${p.id}/stays`, { start_date: '2030-12-20', end_date: '2030-12-27' })).status, 201, 'a stay ahead is never asked about');
    console.log('past stay: asked once with the year, saved anyway on the second tap');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
