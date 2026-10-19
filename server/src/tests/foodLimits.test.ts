/**
 * A guest's food limit reaches both sheets (#977): bold on the day sheet under
 * their plan, and named on the kitchen sheet. Its own day in 2030, tidied
 * afterwards. Needs the database: DATABASE_URL.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { generateKitchenSheetPdf } from '../pdf/kitchenSheetPdf.js';
import { generateDailySchedulePdf } from '../pdf/dailySchedulePdf.js';
import { requireDemoData } from './demoGuard.js';

const TAG = 'Limittest';
const DAY = '2030-03-19';

async function main() {
  const prisma = new PrismaClient();
  const dir = mkdtempSync(join(tmpdir(), 'food-limits-'));
  const tidy = async () => {
    const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
    await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
    await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  };
  const read = (pdf: Buffer, name: string) => {
    const f = join(dir, name);
    writeFileSync(f, pdf);
    return execFileSync('pdftotext', ['-layout', f, '-']).toString().replace(/\s+/g, ' ');
  };
  try {
    await prisma.$connect();
    await requireDemoData(prisma);
    await tidy();
    for (const [name, food_limits] of [[`${TAG} Dairy`, 'No dairy'], [`${TAG} None`, null]] as const) {
      const p = await prisma.patient.create({ data: { name, gender: 'female', food_limits } });
      await prisma.patientStay.create({ data: { patient_id: p.id, start_date: new Date(DAY), end_date: new Date('2030-03-21'), duration_days: 3, on_site: true } });
    }
    const kitchen = read(await generateKitchenSheetPdf(DAY, prisma), 'kitchen.pdf');
    assert.match(kitchen, /Food limits .*Limittest Dairy No dairy/, 'the kitchen sheet does not name the limit');
    assert.doesNotMatch(kitchen, /Limittest None/, 'a guest with no limit was listed');
    const sheet = read(await generateDailySchedulePdf(DAY, prisma), 'day.pdf');
    assert.match(sheet, /Food limits — Limittest Dairy: No dairy/, 'the day sheet does not print the limit');
    console.log('food limits: on the day sheet and the kitchen sheet');
  } finally {
    await tidy();
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
