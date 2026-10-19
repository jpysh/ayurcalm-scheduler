/**
 * A purification course booked turns into its three diets in one tap (#986):
 * oleation from the first Snehapana, after-purification for five days from
 * Virechana, then the usual plan; Undo puts back what ran before. 2030, tidied.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { applyCourseDiet, courseDiet, restoreDiet } from '../patientDiet.js';
import { requireDemoData } from './demoGuard.js';

const TAG = 'Coursediet';
const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function main() {
  const prisma = new PrismaClient();
  const tidy = async () => {
    const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
    await prisma.appointment.deleteMany({ where: { patient_id: { in: ids } } });
    await prisma.dietPlanSegment.deleteMany({ where: { patient_id: { in: ids } } });
    await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
    await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  };
  try {
    await requireDemoData(prisma);
    await tidy();
    const p = await prisma.patient.create({ data: { name: `${TAG} Hema`, gender: 'female' } });
    await prisma.patientStay.create({ data: { patient_id: p.id, start_date: at('2030-09-01'), end_date: at('2030-09-15'), duration_days: 15 } });
    const before = await prisma.dietTemplate.findFirstOrThrow({ where: { name: { startsWith: 'Before purification' } } });
    await prisma.dietPlanSegment.create({ data: { patient_id: p.id, start_date: at('2030-09-01'), end_date: at('2030-09-15'), template_id: before.id } });
    assert.equal(await courseDiet(p.id, '2030-09-01', prisma), null, 'no course booked, nothing offered');

    const book = async (name: string, date: string) => prisma.appointment.create({ data: { patient_id: p.id, therapy_id: (await prisma.therapy.findFirstOrThrow({ where: { name } })).id, scheduled_date: at(date), start_time: '07:00', duration_minutes: 30, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual' } });
    await book('Snehapana', '2030-09-04');
    await book('Virechana', '2030-09-07');
    const offer = await courseDiet(p.id, '2030-09-01', prisma);
    assert.deepEqual(offer?.parts.map((x) => [x.from, x.name.split(' ')[0]]), [['2030-09-04', 'Internal'], ['2030-09-07', 'After'], ['2030-09-12', 'General']]);

    const done = await applyCourseDiet(p.id, '2030-09-01', prisma);
    const segs = async () => (await prisma.dietPlanSegment.findMany({ where: { patient_id: p.id }, orderBy: { start_date: 'asc' }, include: { Template: true } })).map((s) => `${s.start_date.toISOString().slice(5, 10)}..${s.end_date.toISOString().slice(5, 10)} ${s.Template!.name.split(' ')[0]}`);
    assert.deepEqual(await segs(), ['09-01..09-03 Before', '09-04..09-06 Internal', '09-07..09-11 After', '09-12..09-15 General']);
    assert.equal(await courseDiet(p.id, '2030-09-01', prisma), null, 'followed, it is no longer offered');

    await restoreDiet(p.id, '2030-09-01', done!.previous.map((s) => ({ ...s, start_date: s.start_date.toISOString(), end_date: s.end_date.toISOString() })), prisma);
    assert.deepEqual(await segs(), ['09-01..09-15 Before'], 'Undo puts back what ran');
    console.log('PASS courseDiet');
  } finally {
    await tidy();
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
