/**
 * Starter courses before the centre saves its own (#1015): the defaults, built only
 * from the therapies this centre has; a saved list, even an empty one, wins.
 * Needs API_BASE; puts Settings and the one therapy it retires back as they were.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient, Prisma } from '@prisma/client';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;

async function main() {
  const prisma = new PrismaClient();
  const kati = await prisma.therapy.findFirstOrThrow({ where: { name: 'Kati Vasti' } });
  const abhy = await prisma.therapy.findFirstOrThrow({ where: { name: 'Abhyanga' } });
  const was = (await prisma.settings.findUniqueOrThrow({ where: { id: 'singleton' } })).starter_courses;
  try {
    await prisma.settings.update({ where: { id: 'singleton' }, data: { starter_courses: Prisma.DbNull } });
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const call = (method: string, body?: unknown) => fetch(`${API_BASE}/starter-courses`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
    const names = async () => (await call('GET')).map((c: { name: string; lines: unknown[] }) => `${c.name} ${c.lines.length}`);

    assert.deepEqual(await names(), ['Stress and sleep 3', 'Back pain 3', 'Knees and joints 3', 'Eyes 3'], 'the four defaults on the standard library');
    await prisma.therapy.update({ where: { id: kati.id }, data: { is_active: false } });
    assert.deepEqual(await names(), ['Stress and sleep 3', 'Back pain 2', 'Knees and joints 3', 'Eyes 3'], 'a therapy the centre does not offer drops out');
    // #1022: a starter the centre cannot give is listed with why, not hidden and not bookable.
    assert.deepEqual((await call('GET')).map((c: { blocked: string[] }) => c.blocked), [[], ['Elakizhi needs 2 trained therapists'], [], []], 'the seed has one therapist trained for Elakizhi, which needs two');
    await prisma.therapy.update({ where: { id: abhy.id }, data: { staff_required: 99 } });
    assert.deepEqual((await call('GET'))[0].blocked, ['Abhyanga needs 99 trained therapists'], 'a starter needing more therapists than the centre has says so');
    await prisma.therapy.update({ where: { id: abhy.id }, data: { staff_required: abhy.staff_required } });
    await call('PUT', []);
    assert.deepEqual(await names(), [], 'every starter removed stays removed');
    console.log('PASS starters');
  } finally {
    await prisma.therapy.update({ where: { id: kati.id }, data: { is_active: true } });
    await prisma.therapy.update({ where: { id: abhy.id }, data: { staff_required: abhy.staff_required } });
    await prisma.settings.update({ where: { id: 'singleton' }, data: { starter_courses: was ?? Prisma.DbNull } });
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
