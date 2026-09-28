/**
 * The discharge summary (#194): the doctor's link and the admin both edit it,
 * the number is given once, the admin's "final" closes it to the link, the
 * day-by-day table has one row per day with BP from the records, and a long
 * stay with everything filled in still prints on two A4 pages.
 *
 * Its own 30-day stay in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { newLinkToken } from '../links.js';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Dischargetest';

async function main() {
  const prisma = new PrismaClient();
  const tidy = async () => {
    const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
    await prisma.appointment.deleteMany({ where: { patient_id: { in: ids } } });
    await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
    await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  };
  try {
    await requireDemoData(prisma);
    await tidy();
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const call = (method: string, path: string, body?: unknown, auth = true) => fetch(`${API_BASE}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });

    const doctor = await prisma.staff.findFirstOrThrow({ where: { role: 'doctor', is_active: true } });
    const link = doctor.link_token || newLinkToken();
    await prisma.staff.update({ where: { id: doctor.id }, data: { link_token: link } });
    const therapist = await prisma.staff.findFirstOrThrow({ where: { role: 'therapist', is_active: true } });
    const therapy = await prisma.therapy.findFirstOrThrow({ where: { is_consultation: false } });
    const consult = await prisma.therapy.findFirstOrThrow({ where: { is_consultation: true } });
    const room = await prisma.therapyRoom.findFirstOrThrow();
    const p = await prisma.patient.create({ data: { name: `${TAG} Resident`, gender: 'female' } });
    const start = new Date('2030-03-01T00:00:00Z');
    const stay = await prisma.patientStay.create({ data: { patient_id: p.id, start_date: start, end_date: new Date('2030-03-30T00:00:00Z'), duration_days: 30, concerns: 'Back pain' } });
    for (let i = 0; i < 30; i++) {
      const day = new Date(start.getTime() + i * 86400000);
      await prisma.appointment.create({ data: { patient_id: p.id, therapy_id: therapy.id, staff_id: therapist.id, room_id: room.id, scheduled_date: day, start_time: '10:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'completed', assignment_type: 'manual', record: { vitals: { bp: `12${i % 10}/80` } } } });
      if (i % 7 === 0) await prisma.appointment.create({ data: { patient_id: p.id, therapy_id: consult.id, staff_id: doctor.id, room_id: room.id, scheduled_date: day, start_time: '09:00', duration_minutes: 20, session_number: 1, total_sessions: 1, status: 'completed', assignment_type: 'manual' } });
    }

    // The doctor's link writes first; the number is given then and kept.
    const long = 'Avoid fried food, cold drinks and late nights. Walk thirty minutes a day. '.repeat(6);
    const meds = Array.from({ length: 8 }, (_, i) => ({ name: `Tab. Medicine ${i + 1}`, dose: '1-X-1', timing: 'after food', days: '10' }));
    let r = await call('PUT', `/public/link/${link}/discharges/${stay.id}`, { diagnosis: 'Kati shool', meds_stay: meds, meds_home: meds, instructions: long, follow_up: long, urgent_how: long, reason: long, condition: long }, false);
    assert.equal(r.status, 200, await r.clone().text());
    const first = await r.json();
    assert.ok(first.draft.no, 'a number is given on the first save');
    assert.equal(first.table.length, 30, 'one row a day');
    assert.equal(first.table[3].bp, '123/80', 'BP comes from that day\'s record');
    assert.ok(first.table[0].items.some((x: { consultation: boolean }) => x.consultation), 'consultations are marked');

    // The admin edits and makes it final; the link can read but no longer save.
    r = await call('PUT', `/patients/${p.id}/stays/${stay.id}/discharge`, { diagnosis: 'Kati shool with sciatica', final: true });
    const after = await r.json();
    assert.equal(after.draft.no, first.draft.no, 'the number never changes');
    assert.equal(after.draft.meds_stay.length, 8, 'the admin save keeps what the doctor wrote');
    r = await call('PUT', `/public/link/${link}/discharges/${stay.id}`, { diagnosis: 'changed' }, false);
    assert.equal(r.status, 409, 'final closes the summary to the link');
    r = await call('PUT', `/public/link/${link}/discharges/${stay.id}`, { final: false }, false);
    assert.equal(r.status, 409);
    assert.equal((await (await call('GET', `/patients/${p.id}/stays/${stay.id}/discharge`)).json()).draft.diagnosis, 'Kati shool with sciatica');

    // Signed out, nothing.
    assert.equal((await call('GET', `/patients/${p.id}/stays/${stay.id}/discharge`, undefined, false)).status, 401);

    // Everything filled in, thirty days: still two pages.
    const pdf = Buffer.from(await (await call('GET', `/patients/${p.id}/stays/${stay.id}/discharge-pdf`)).arrayBuffer());
    const pages = (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
    assert.ok(pages >= 1 && pages <= 2, `the summary is ${pages} pages`);
    console.log(`discharge: number ${after.draft.no}, ${pages} page(s)`);
  } finally {
    await tidy();
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
