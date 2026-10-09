/**
 * A guest marked not available for some hours or the whole day still gets their meals (#695):
 * the kitchen sheet counts them and names them as away, and their meals sheet says so.
 * Its own day in 2030, tidied afterwards. Needs the database: DATABASE_URL.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { generateKitchenSheetPdf } from '../pdf/kitchenSheetPdf.js';
import { residentDay } from '../residentDay.js';
import { requireDemoData } from './demoGuard.js';

const TAG = 'Awaytest';
const DAY = '2030-03-12';

async function main() {
  const prisma = new PrismaClient();
  const dir = mkdtempSync(join(tmpdir(), 'kitchen-away-'));
  const tidy = async () => {
    const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
    await prisma.timeOff.deleteMany({ where: { entity_type: 'patient', entity_id: { in: ids } } });
    await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
    await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  };
  try {
    await prisma.$connect();
    await requireDemoData(prisma);
    await tidy();
    const made = [];
    for (const name of [`${TAG} Morning`, `${TAG} Allday`, `${TAG} Home`]) {
      const p = await prisma.patient.create({ data: { name, gender: 'female' } });
      await prisma.patientStay.create({ data: { patient_id: p.id, start_date: new Date(DAY), end_date: new Date('2030-03-14'), duration_days: 3, on_site: true } });
      made.push(p);
    }
    await prisma.timeOff.create({ data: { entity_type: 'patient', entity_id: made[0].id, date: new Date(DAY), start_time: '09:00', end_time: '13:00', weekdays: [] } });
    await prisma.timeOff.create({ data: { entity_type: 'patient', entity_id: made[1].id, date: new Date(DAY), weekdays: [] } });

    const before = await generateKitchenSheetPdf(DAY, prisma);
    const f = join(dir, 'kitchen.pdf');
    writeFileSync(f, before);
    const text = execFileSync('pdftotext', ['-layout', f, '-']).toString().replace(/\s+/g, ' ');
    assert.match(text, /Awaytest Morning AWAY 09:00–13:00/, 'the guest away for the morning is not marked');
    assert.match(text, /Awaytest Allday AWAY all day/, 'the guest away all day is not marked');
    assert.doesNotMatch(text, /Awaytest Home AWAY/, 'a guest who is in was marked away');

    // Away never drops a meal: the count is the same as with nobody away.
    const staying = (t: string) => Number(/Kitchen — (\d+) staying/.exec(t)?.[1]);
    await prisma.timeOff.deleteMany({ where: { entity_type: 'patient', entity_id: { in: made.map((p) => p.id) } } });
    writeFileSync(f, await generateKitchenSheetPdf(DAY, prisma));
    const after = execFileSync('pdftotext', ['-layout', f, '-']).toString().replace(/\s+/g, ' ');
    assert.equal(staying(text), staying(after), 'an away guest was dropped from the kitchen count');

    await prisma.timeOff.create({ data: { entity_type: 'patient', entity_id: made[0].id, date: new Date(DAY), start_time: '09:00', end_time: '13:00', weekdays: [] } });
    assert.equal((await residentDay(made[0].id, DAY, prisma))?.away, 'AWAY 09:00–13:00', 'the meals sheet does not say the guest is away');
    assert.equal((await residentDay(made[2].id, DAY, prisma))?.away, null);
    console.log('kitchen: an away guest is marked, and still counted');
  } finally {
    await tidy();
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
