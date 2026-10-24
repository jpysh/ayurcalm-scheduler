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
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { newLinkToken } from '../links.js';
import { dischargeOf } from '../discharge.js';
import { pageLine } from '../pdf/dischargePdf.js';
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

    // #937: an unsaved draft on the leaving day carries the centre's real time (19:37 in Kolkata), never a made-up 11:00,
    // and the doctor's last visit note is not copied into the instructions.
    await prisma.patient.update({ where: { id: p.id }, data: { doctor_plan: 'Add Kati Vasti for 5 days' } });
    const out = await prisma.patientStay.create({ data: { patient_id: p.id, start_date: new Date('2030-04-01T00:00:00Z'), end_date: new Date('2030-04-02T00:00:00Z'), duration_days: 2 } });
    const live = (await dischargeOf(out.id, prisma, new Date('2030-04-02T14:07:00Z')))!.draft;
    assert.equal(live.discharged_time, '19:37');
    assert.equal(live.signed_at, '2030-04-02 19:37');
    assert.equal(live.admitted_time, '', 'an arrival time nobody recorded is not invented');
    assert.equal(live.instructions, '', 'the last visit note is not a discharge instruction');
    const early = (await dischargeOf(out.id, prisma, new Date('2030-04-01T14:07:00Z')))!.draft;
    assert.equal(early.discharged_time, '', 'not the leaving day: no time is invented');
    assert.equal(early.signed_at, '2030-04-02');
    // #1077: a day nothing was given reads why, not "Rest": they did not come, or the centre was shut.
    await prisma.appointment.create({ data: { patient_id: p.id, therapy_id: therapy.id, staff_id: therapist.id, room_id: room.id, scheduled_date: new Date('2030-04-01T00:00:00Z'), start_time: '10:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'no_show', assignment_type: 'manual' } });
    const shut = await prisma.timeOff.create({ data: { entity_type: 'center', date: new Date('2030-04-02T00:00:00Z'), start_date: new Date('2030-04-02T00:00:00Z'), end_date: new Date('2030-04-02T00:00:00Z'), description: 'Test closure' } });
    try {
      const notes = (await dischargeOf(out.id, prisma))!.table.map((r) => r.note);
      assert.deepEqual(notes, ['Did not come', 'Centre closed']);
    } finally {
      await prisma.timeOff.delete({ where: { id: shut.id } });
    }
    await prisma.patientStay.delete({ where: { id: out.id } });

    assert.equal(pageLine('Leela Menon', '', 1, 1), 'Leela Menon · page 1 of 1', 'no number, no empty separator (#542)');
    assert.equal(pageLine('Leela Menon', 'DS/2030/0001', 2, 2), 'Leela Menon · DS/2030/0001 · page 2 of 2');
    // The doctor's link writes first; the number is given then and kept.
    const long = 'Avoid fried food, cold drinks and late nights. Walk thirty minutes a day. '.repeat(6);
    const meds = Array.from({ length: 8 }, (_, i) => ({ name: `Tab. Medicine ${i + 1}`, dose: '1-X-1', timing: 'after food', days: '10' }));
    let r = await call('PUT', `/public/link/${link}/discharges/${stay.id}`, { diagnosis: 'Kati shool', meds_stay: meds, meds_home: meds, instructions: long, follow_up: long, urgent_how: long, reason: long, condition: long }, false);
    assert.equal(r.status, 200, await r.clone().text());
    const first = await r.json();
    assert.ok(first.draft.no, 'a number is given on the first save');
    assert.equal(first.table.length, 30, 'one row a day');
    // The card's Medication line is offered as a first row (#524), trimmed to 120 characters, never added by itself.
    assert.equal(first.card_medication, '', 'no line on the card, nothing offered');
    await prisma.patient.update({ where: { id: p.id }, data: { medication: ' Ashwagandha tablet, 1 twice a day after food ' + 'x'.repeat(200) } });
    const offered = await (await call('GET', `/patients/${p.id}/stays/${stay.id}/discharge`)).json();
    assert.equal(offered.card_medication.length, 120, 'the card line is offered, trimmed');
    assert.ok(offered.card_medication.startsWith('Ashwagandha tablet'), 'and trimmed of spaces');
    assert.equal(offered.draft.meds_stay.length, 8, 'what the doctor wrote is untouched');
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

    // A stay with no consultation has no signer until a doctor writes it from their link.
    const bare = await prisma.patientStay.create({ data: { patient_id: p.id, start_date: new Date('2030-05-01T00:00:00Z'), end_date: new Date('2030-05-03T00:00:00Z'), duration_days: 3 } });
    r = await call('PUT', `/public/link/${link}/discharges/${bare.id}`, { doctor_id: null, diagnosis: 'x' }, false);
    assert.equal((await r.json()).draft.doctor_id, doctor.id, 'the doctor who writes it signs it');
    // A follow-up date alone counts as the follow-up being set (#500).
    const missing = async () => ((await (await call('GET', `/patients/${p.id}/stays/${bare.id}/discharge`)).json()).ready.missing as { key: string }[]).map((m) => m.key);
    assert.ok((await missing()).includes('follow_up'), 'nothing set: follow-up is missing');
    await call('PUT', `/patients/${p.id}/stays/${bare.id}/discharge`, { follow_up_date: '2030-06-01' });
    assert.ok(!(await missing()).includes('follow_up'), 'a follow-up date counts');

    // Signed out, nothing.
    assert.equal((await call('GET', `/patients/${p.id}/stays/${stay.id}/discharge`, undefined, false)).status, 401);

    // A long email is printed whole, and a typed payment date reads like the others (#845).
    const email = 'leela.menon.longname@a-long-example-domain.com';
    await prisma.patient.update({ where: { id: p.id }, data: { email } });
    await call('PUT', `/patients/${p.id}/stays/${stay.id}/discharge`, { payment_amount: 'Rs. 50,000', payment_mode: 'Cash', payment_date: '2030-03-30' });

    // Everything filled in, thirty days: still two pages.
    const pdf = Buffer.from(await (await call('GET', `/patients/${p.id}/stays/${stay.id}/discharge-pdf`)).arrayBuffer());
    const words = execFileSync('pdftotext', ['-raw', '-', '-'], { input: pdf }).toString();
    assert.ok(words.replace(/\n/g, '').includes(email), 'the email is printed whole, on two lines if it must');
    assert.ok(words.includes('30 Mar 2030') && !words.includes('2030-03-30'), 'the payment date reads 30 Mar 2030');
    // A Hindi footer and registration line print in the Devanagari font, the rest still in Helvetica (#1136).
    const settings = await prisma.settings.findFirst();
    const kept = settings!.letterhead;
    await prisma.settings.update({ where: { id: settings!.id }, data: { letterhead: { ...((kept as object) || {}), footer_line: 'धन्यवाद। फिर पधारें।', registration_line: 'पंजीकरण संख्या 1234' } } });
    try {
      const hindi = Buffer.from(await (await call('GET', `/patients/${p.id}/stays/${stay.id}/discharge-pdf`)).arrayBuffer());
      const text = execFileSync('pdftotext', ['-raw', '-', '-'], { input: hindi }).toString();
      assert.ok(text.includes('धन्यवाद') && text.includes('1234'), 'the Hindi footer or registration line is not drawn in Devanagari');
      assert.ok(text.includes('page 1 of'), 'the Latin part of the footer was lost');
    } finally {
      await prisma.settings.update({ where: { id: settings!.id }, data: { letterhead: kept ?? undefined } });
    }
    const pages = (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
    assert.ok(pages >= 1 && pages <= 2, `the summary is ${pages} pages`);
    console.log(`discharge: number ${after.draft.no}, ${pages} page(s)`);
  } finally {
    await tidy();
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
