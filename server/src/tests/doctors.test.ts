/**
 * Doctors (#219): a doctor is staff with role "doctor", booked for a
 * consultation through the same tables, and printed on the doctor rota, not
 * the therapist rota. Builds its own day in 2030 and removes it.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { generateTherapistRotaPdf } from '../pdf/therapistRotaPdf.js';

const prisma = new PrismaClient();
const DAY = '2030-03-13';
const tag = `T${Date.now()}`;
const dir = mkdtempSync(join(tmpdir(), 'doctors-'));
const text = async (role: 'therapist' | 'doctor') => {
  const path = join(dir, `${role}.pdf`);
  writeFileSync(path, await generateTherapistRotaPdf(DAY, prisma, undefined, role));
  return execFileSync('pdftotext', ['-raw', path, '-']).toString().replace(/\s+/g, ' ');
};

const consult = await prisma.therapy.create({ data: { name: `Consultation ${tag}`, required_amenities: [], duration_minutes: 20, is_consultation: true } });
const doctor = await prisma.staff.create({ data: { name: `Dr ${tag}`, gender: 'female', role: 'doctor', specializations: [consult.id], weekly_schedule: {} } });
const patient = await prisma.patient.create({ data: { name: `Resident ${tag}`, gender: 'female' } });
const appt = await prisma.appointment.create({ data: {
  patient_id: patient.id, therapy_id: consult.id, staff_id: doctor.id, scheduled_date: new Date(DAY), start_time: '09:20',
  duration_minutes: 20, session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual',
} });
try {
  const doctors = await text('doctor');
  assert.match(doctors, /Doctor rota/);
  assert.ok(doctors.includes(`Dr ${tag}`), 'the doctor is on the doctor rota');
  assert.ok(doctors.includes(`Resident ${tag}`), 'with their consultation');
  const therapists = await text('therapist');
  assert.ok(!therapists.includes(`Dr ${tag}`), 'a doctor is not on the therapist rota');
  console.log('doctors: ok');
} finally {
  await prisma.appointment.delete({ where: { id: appt.id } });
  await prisma.patient.delete({ where: { id: patient.id } });
  await prisma.staff.delete({ where: { id: doctor.id } });
  await prisma.therapy.delete({ where: { id: consult.id } });
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
}
