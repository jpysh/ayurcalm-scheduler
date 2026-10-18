/**
 * The same leave saved twice (a double tap, or a retry after an interrupted plan, #936)
 * is one row, so Availability and the Log show it once.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API = process.env.API_BASE || 'http://localhost:4000/api';

async function main() {
  const prisma = new PrismaClient();
  let staffId = '';
  try {
    await prisma.$connect();
    await requireDemoData(prisma);
    const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` };
    staffId = (await prisma.staff.create({ data: { name: 'Twice Asha', gender: 'other', is_active: true, specializations: [], weekly_schedule: {} } })).id;
    const body = JSON.stringify({ entity_type: 'staff', entity_id: staffId, date: '2030-03-11', start_date: '2030-03-11', end_date: '2030-03-11', description: 'Sick', plan: false });
    const [a, b] = await Promise.all([fetch(`${API}/timeoff`, { method: 'POST', headers, body }), fetch(`${API}/timeoff`, { method: 'POST', headers, body })]);
    assert.ok(a.status < 300 && b.status < 300, 'both taps are answered');
    const again = await fetch(`${API}/timeoff`, { method: 'POST', headers, body });
    assert.ok(again.status < 300);
    const rows = await prisma.timeOff.findMany({ where: { entity_id: staffId } });
    assert.equal(rows.length, 1, 'one leave for that person and day');
    console.log('ok');
  } finally {
    if (staffId) {
      await prisma.timeOff.deleteMany({ where: { entity_id: staffId } });
      await prisma.staff.delete({ where: { id: staffId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
