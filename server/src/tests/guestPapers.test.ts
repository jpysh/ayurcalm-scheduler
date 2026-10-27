/**
 * Guest papers (#1251): What needs you names a guest here with no ID number, a foreign guest whose visa ends before
 * they leave, and a stay extended after its Form C was filed.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Paperstest';

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
    const call = async (method: string, path: string, body?: unknown) => { const r = await fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); assert.ok(r.ok, `${method} ${path}: ${r.status} ${await r.clone().text()}`); return r.json(); };
    const stay = { start_date: '2030-11-10', end_date: '2030-11-20' };
    await call('POST', '/patients', { name: `${TAG} NoId`, gender: 'female', stay });
    await call('POST', '/patients', { name: `${TAG} Visa`, gender: 'female', country: 'Germany', id_number: 'C1', visa_valid_until: '2030-11-15', stay });
    const ext = await call('POST', '/patients', { name: `${TAG} Extended`, gender: 'male', country: 'France', id_number: 'F1', visa_valid_until: '2031-01-01', stay });
    const extStay = ext.Stays[0];
    await call('PATCH', `/patients/${ext.id}/stays/${extStay.id}/form-c`, { filed: true });
    await call('PUT', `/patients/${ext.id}/stays/${extStay.id}`, { start_date: '2030-11-10', end_date: '2030-11-24' });
    await call('POST', '/patients', { name: `${TAG} Fine`, gender: 'female', id_number: 'A1', stay });
    const lines = (await call('GET', '/attention?date=2030-11-12')).items.filter((i: { rule: string; who: string }) => i.rule === 'papers' && i.who.startsWith(TAG)).map((i: { who: string; what: string }) => `${i.who}: ${i.what}`).sort();
    assert.equal(lines.length, 3, lines.join(' | '));
    assert.match(lines[0], /Extended: Stay changed to leave Sun 24 Nov after Form C was filed/);
    assert.match(lines[1], /NoId: No ID number/);
    assert.match(lines[2], /Visa: Visa ends Fri 15 Nov, before they leave/);
    console.log('guest papers: no ID, a visa ending early and an extension after Form C are each named once');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
