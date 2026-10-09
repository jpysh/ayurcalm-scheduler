/**
 * The kitchen cooks for the patients who sleep at the centre: a day patient (Stays on site
 * off) goes home and is not counted (#607). Its own day in 2030, tidied afterwards.
 * Needs the database: DATABASE_URL.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { generateKitchenSheetPdf } from '../pdf/kitchenSheetPdf.js';
import { requireDemoData } from './demoGuard.js';

const TAG = 'Kitchentest';
const DAY = '2030-03-11';

async function main() {
  const prisma = new PrismaClient();
  const dir = mkdtempSync(join(tmpdir(), 'kitchen-'));
  const tidy = async () => {
    const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
    await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
    await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  };
  try {
    await prisma.$connect();
    await requireDemoData(prisma);
    await tidy();
    for (const [name, on_site] of [[`${TAG} Resident`, true], [`${TAG} Visitor`, false]] as const) {
      const p = await prisma.patient.create({ data: { name, gender: 'female' } });
      await prisma.patientStay.create({ data: { patient_id: p.id, start_date: new Date(DAY), end_date: new Date('2030-03-14'), duration_days: 4, on_site } });
    }
    const f = join(dir, 'kitchen.pdf');
    writeFileSync(f, await generateKitchenSheetPdf(DAY, prisma));
    const text = execFileSync('pdftotext', ['-raw', f, '-']).toString().replace(/\s+/g, ' ');
    assert.match(text, /Kitchen — 1 staying/, 'a day patient was counted as staying');
    console.log('kitchen: a day patient is not counted');
  } finally {
    await tidy();
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
