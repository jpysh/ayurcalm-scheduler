/**
 * Leaving early or in late narrows the hours Team shows for that day (#570),
 * so "09:00–15:00" and "of 6h booked" agree.
 *
 * A fixed day in 2030, tidied afterwards. Needs the database only.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { staffWeek } from '../staffWeek.js';

const TAG = 'Parttest';
const DAY = '2030-08-14';
const date = new Date(`${DAY}T00:00:00.000Z`);
const allWeek = Object.fromEntries(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]));

async function main() {
  const prisma = new PrismaClient();
  const tidy = async () => {
    const ids = (await prisma.staff.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((s) => s.id);
    await prisma.timeOff.deleteMany({ where: { entity_id: { in: ids } } });
    await prisma.staff.deleteMany({ where: { id: { in: ids } } });
  };
  try {
    await tidy();
    const [early, late] = await Promise.all(['Early', 'Late'].map((n) => prisma.staff.create({ data: { name: `${TAG} ${n}`, gender: 'female', specializations: [], weekly_schedule: allWeek } })));
    await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: early.id, date, start_time: '15:00', end_time: '18:00', description: 'Leaving early' } });
    await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: late.id, date, start_time: '09:00', end_time: '11:00', description: 'In late' } });
    const { rows } = await staffWeek(DAY, prisma);
    const day = (id: string) => rows.find((r) => r.id === id)!.days[0];
    assert.deepEqual([day(early.id).state, day(early.id).start, day(early.id).end, day(early.id).capacity], ['part', '09:00', '15:00', 360]);
    assert.deepEqual([day(late.id).start, day(late.id).end, day(late.id).capacity], ['11:00', '18:00', 420]);
    console.log('PASS teamPartDay');
  } finally {
    await tidy();
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
