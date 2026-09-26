/**
 * #134: a treatment still booked with a therapist who is off for the day shows
 * on both printed sheets, marked, so the resident and the team read the same
 * thing. The rota used to drop it and the patient sheet printed the absent
 * therapist's name as if nothing were wrong.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { generateDailySchedulePdf } from '../pdf/dailySchedulePdf.js';
import { generateTherapistRotaPdf } from '../pdf/therapistRotaPdf.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requireDemoData } from './demoGuard.js';

const TAG = 'Unstaffedtest';
const DAY = '2030-02-13';

async function tidy(prisma: PrismaClient) {
  const staff = await prisma.staff.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  await prisma.timeOff.deleteMany({ where: { entity_id: { in: staff.map((s) => s.id) } } });
  const patients = await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  await prisma.appointment.deleteMany({ where: { patient_id: { in: patients.map((p) => p.id) } } });
  await prisma.patient.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.staff.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapy.deleteMany({ where: { name: { startsWith: TAG } } });
}

const pdfText = (dir: string, name: string, pdf: Buffer) => {
  const path = join(dir, name);
  writeFileSync(path, pdf);
  return execFileSync('pdftotext', ['-raw', path, '-']).toString().replace(/\s+/g, ' ');
};

async function main() {
  const prisma = new PrismaClient();
  const dir = mkdtempSync(join(tmpdir(), 'unstaffed-'));
  try {
    await prisma.$connect();
    await requireDemoData(prisma);
    await tidy(prisma);
    const day = new Date(`${DAY}T00:00:00.000Z`);
    const therapy = await prisma.therapy.create({ data: { name: `${TAG} Sweda`, required_amenities: [], duration_minutes: 60 } });
    const kriti = await prisma.staff.create({ data: { name: `${TAG} Kriti`, gender: 'female', specializations: [therapy.id], weekly_schedule: {} } });
    const aarav = await prisma.patient.create({ data: { name: `${TAG} Aarav`, gender: 'male' } });
    await prisma.appointment.create({
      data: {
        patient_id: aarav.id, therapy_id: therapy.id, staff_id: kriti.id, scheduled_date: day, start_time: '14:00', duration_minutes: 60,
        session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual',
      },
    });
    await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: kriti.id, date: day, description: 'Leave' } });

    const patientSheet = pdfText(dir, 'patient.pdf', await generateDailySchedulePdf(DAY, prisma));
    assert.ok(patientSheet.includes(`NO THERAPIST · ${TAG} Sweda 60m · ${TAG} Kriti (off)`), 'The patient sheet does not mark the unstaffed treatment');

    const rota = pdfText(dir, 'rota.pdf', await generateTherapistRotaPdf(DAY, prisma));
    assert.ok(rota.includes('Needs a therapist'), 'The rota has no "Needs a therapist" group');
    assert.ok(rota.includes(`14:00 NO THERAPIST · ${TAG} Sweda 60m · ${TAG} Aarav`), 'The rota drops the treatment booked with a therapist who is off');
    console.log('A treatment booked with a therapist who is off is marked on both sheets.');
  } finally {
    await tidy(prisma).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
