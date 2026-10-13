/** The seeded day is read on the centre's clock: nothing is marked "didn't come" before it has started (#753). */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { centreClock } from '../availability.js';

const prisma = new PrismaClient();
try {
  const tz = (await prisma.settings.findUnique({ where: { id: 'singleton' } }))?.timezone || 'Asia/Kolkata';
  const { date, time } = centreClock(tz);
  const early = await prisma.appointment.findMany({ where: { scheduled_date: new Date(`${date}T00:00:00.000Z`), status: 'no_show', start_time: { gt: time } } });
  assert.equal(early.length, 0, `marked "didn't come" before it started: ${early.map((a) => a.start_time).join(', ')}`);
  console.log('seedClock: ok');
} finally {
  await prisma.$disconnect();
}
