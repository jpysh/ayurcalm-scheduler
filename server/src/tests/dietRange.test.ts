/**
 * One meal changed over several days at once (#982), and what was there handed
 * back so Undo can put it back. A fixed week in 2030. Needs API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Dietrange';

async function main() {
  const prisma = new PrismaClient();
  const tidy = async () => {
    const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
    await prisma.dietPlan.deleteMany({ where: { patient_id: { in: ids } } });
    await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  };
  try {
    await tidy();
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const post = async (body: object) => (await fetch(`${API_BASE}/dietplans`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })).json();
    const p = await prisma.patient.create({ data: { name: `${TAG} Asha`, gender: 'female' } });
    const lunches = async () => (await prisma.dietPlan.findMany({ where: { patient_id: p.id }, orderBy: { date: 'asc' } })).map((r) => `${r.date.toISOString().slice(8, 10)} ${r.description}`);

    await post({ patient_id: p.id, date: '2030-08-21', meal_time: 'lunch', description: 'Khichdi' });
    const out = await post({ patient_id: p.id, date: '2030-08-20', until: '2030-08-22', meal_time: 'lunch', description: 'No buttermilk' });
    assert.equal(out.days, 3);
    assert.deepEqual(await lunches(), ['20 No buttermilk', '21 No buttermilk', '22 No buttermilk'], 'every day in the range');
    assert.deepEqual(out.previous.map((x: { date: string; description: string }) => [x.date, x.description]), [['2030-08-21', 'Khichdi']], 'what was there, for Undo');

    await post({ patient_id: p.id, date: '2030-08-20', until: '2030-08-22', meal_time: 'lunch', description: '' });
    assert.deepEqual(await lunches(), [], 'emptied over the range hands the meals back to the plan');
    console.log('PASS dietRange');
  } finally {
    await tidy();
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
