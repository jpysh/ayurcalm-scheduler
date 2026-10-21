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
  const rooms = await prisma.therapyRoom.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  await prisma.timeOff.deleteMany({ where: { entity_id: { in: rooms.map((r: { id: string }) => r.id) } } });
  await prisma.therapyRoom.deleteMany({ where: { name: { startsWith: TAG } } });
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
    // Under the title, what was still wrong when it was printed (#1030).
    assert.ok(patientSheet.includes(`NOT FIXED WHEN PRINTED: ${TAG} Kriti is off`), `The patient sheet does not say what was not fixed: ${patientSheet.slice(0, 400)}`);
    assert.ok(rota.includes(`NOT FIXED WHEN PRINTED: ${TAG} Kriti is off`), 'The rota does not say what was not fixed');
    assert.ok(!pdfText(dir, 'own.pdf', await generateTherapistRotaPdf(DAY, prisma, kriti.id)).includes('NOT FIXED'), "A therapist's own rota carries the centre's problems");
    assert.ok(rota.includes(`14:00 NO THERAPIST · ${TAG} Sweda 60m · ${TAG} Aarav`), 'The rota drops the treatment booked with a therapist who is off');

    // A room out of use for part of the day is marked too, as the day check calls it blocking (#758).
    const DAY2 = '2030-02-14';
    const room = await prisma.therapyRoom.create({ data: { name: `${TAG} Chandra`, weekly_schedule: {} } });
    await prisma.appointment.create({
      data: {
        patient_id: aarav.id, therapy_id: therapy.id, staff_id: kriti.id, room_id: room.id, scheduled_date: new Date(`${DAY2}T00:00:00.000Z`), start_time: '10:00', duration_minutes: 60,
        session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual',
      },
    });
    await prisma.timeOff.create({ data: { entity_type: 'room', entity_id: room.id, date: new Date(`${DAY2}T00:00:00.000Z`), start_date: new Date(`${DAY2}T00:00:00.000Z`), end_date: new Date(`${DAY2}T00:00:00.000Z`), start_time: '07:00', end_time: '12:00', description: 'Plumbing' } });
    const sheet2 = pdfText(dir, 'patient2.pdf', await generateDailySchedulePdf(DAY2, prisma));
    assert.ok(sheet2.includes(`ROOM OUT · ${TAG} Sweda 60m · ${TAG} Kriti · ${TAG} Chandra (out)`), `The patient sheet does not mark a treatment in a room out of use: ${sheet2.slice(0, 600)}`);
    const rota2 = pdfText(dir, 'rota2.pdf', await generateTherapistRotaPdf(DAY2, prisma));
    assert.ok(rota2.includes(`ROOM OUT · ${TAG} Sweda 60m · ${TAG} Aarav · ${TAG} Chandra (out)`), `The rota does not mark a treatment in a room out of use: ${rota2.slice(0, 600)}`);
    console.log('A treatment booked with a therapist who is off is marked on both sheets.');
  } finally {
    await tidy(prisma).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
