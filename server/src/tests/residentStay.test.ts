/**
 * A resident added in the app is on the day sheet (#142).
 *
 * Add Patient used to write two dates nothing read, and no stay: the resident
 * never counted as in house and never printed. This adds one through the same
 * request the app sends, with a stay and a diet plan, and reads the printed
 * sheet back. Then it ends the stay early: the treatment booked after it is
 * offered for cancelling, the cancel is one batch, and Undo puts it back.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { generateDailySchedulePdf } from '../pdf/dailySchedulePdf.js';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Staytest';

async function tidy(prisma: PrismaClient) {
  const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.dietPlanSegment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  await prisma.therapy.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  const prisma = new PrismaClient();
  const dir = mkdtempSync(join(tmpdir(), 'stay-'));
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }),
    })).json();
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
      assert.ok(res.ok, `${method} ${path}: ${res.status} ${await res.clone().text()}`);
      return res.json();
    };

    const plan = await prisma.dietTemplate.findFirst({ orderBy: { name: 'asc' } });
    assert.ok(plan, 'the demo has no diet plan to choose');
    const created = await call('POST', '/patients', {
      name: `${TAG} Meera`, gender: 'female', phone: '9800000000',
      stay: { start_date: '2030-02-10', end_date: '2030-02-16' }, template_id: plan.id,
    });
    assert.equal(created.Stays.length, 1, 'saving a resident should save their stay');

    const pdf = join(dir, 'day.pdf');
    writeFileSync(pdf, await generateDailySchedulePdf('2030-02-11', prisma));
    const text = execFileSync('pdftotext', ['-raw', pdf, '-']).toString().replace(/\s+/g, ' ');
    assert.ok(text.includes(`${TAG} Meera`), 'a resident added in the app is missing from the day sheet');
    assert.ok(text.includes(plan.name), `the sheet does not show their diet plan, ${plan.name}`);

    // Leaves early: the treatment after the new last day is offered, and only that one.
    const therapy = await prisma.therapy.create({ data: { name: `${TAG} Abhyanga`, required_amenities: [], duration_minutes: 60 } });
    const book = (date: string) => prisma.appointment.create({ data: {
      patient_id: created.id, therapy_id: therapy.id, scheduled_date: new Date(`${date}T00:00:00.000Z`), start_time: '10:00',
      duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual',
    } });
    const kept = await book('2030-02-12');
    const after = await book('2030-02-14');
    const out = await call('PUT', `/patients/${created.id}/stays/${created.Stays[0].id}`, { start_date: '2030-02-10', end_date: '2030-02-12' });
    assert.equal(out.stay.duration_days, 3);
    assert.deepEqual(out.left_over.map((a: { id: string }) => a.id), [after.id], 'only treatments after the new last day are left over');

    const cancelled = await call('POST', '/day-check/accept', { date: '2030-02-14', moves: [{ appointment_id: after.id, staff_id: null, co_staff_ids: [], room_id: null, start_time: '10:00', date: '2030-02-14', cancel: true }] });
    assert.equal((await prisma.appointment.findUnique({ where: { id: after.id } }))?.status, 'cancelled', 'cancel should keep the treatment, as cancelled');
    assert.equal((await prisma.appointment.findUnique({ where: { id: kept.id } }))?.status, 'pending');
    await call('POST', '/replan/undo', { batch_id: cancelled.batch_id });
    assert.equal((await prisma.appointment.findUnique({ where: { id: after.id } }))?.status, 'pending', 'Undo should put the treatment back');

    console.log('Resident stay: added in the app, on the sheet with their plan; leaving early cancels what is left, and Undo restores it.');
  } finally {
    await tidy(prisma).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
