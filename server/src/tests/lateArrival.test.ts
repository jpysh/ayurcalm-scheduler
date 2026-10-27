/**
 * Arriving days later (#1193): the admin chooses. 'cancel' cancels what was booked before the
 * new arrival and keeps the leaving day; 'shift' moves every treatment later by the same days.
 * Either way one Undo puts it back. Arriving hours late is the guest away until then: that day's earlier treatments move later (#1240). The preview counts what is booked before the new arrival.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Latetest';
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

async function tidy(prisma: PrismaClient) {
  const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.timeOff.deleteMany({ where: { entity_type: 'patient', entity_id: { in: ids } } });
  await prisma.dietPlanSegment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const call = async (method: string, path: string, body?: unknown) => { const r = await fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); assert.ok(r.ok, `${method} ${path}: ${r.status} ${await r.clone().text()}`); return r.status === 204 ? null : r.json(); };
    const [therapy, staff, room] = await Promise.all([
      prisma.therapy.findFirstOrThrow({ where: { is_consultation: false } }),
      prisma.staff.findFirstOrThrow({ where: { is_active: true } }),
      prisma.therapyRoom.findFirstOrThrow(),
    ]);
    const guest = async (name: string) => {
      const p = await prisma.patient.create({ data: { name: `${TAG} ${name}`, gender: 'female' } });
      const stay = await prisma.patientStay.create({ data: { patient_id: p.id, start_date: day('2030-05-06'), end_date: day('2030-05-12'), duration_days: 7, on_site: true } });
      const appt = { patient_id: p.id, therapy_id: therapy.id, staff_id: staff.id, room_id: room.id, start_time: name === 'Shift' ? '08:00' : '07:00', duration_minutes: therapy.duration_minutes, co_staff_ids: [], session_number: 1, total_sessions: 1, status: 'confirmed' as const, assignment_type: 'manual' as const };
      const appts = await Promise.all(['2030-05-06', '2030-05-07', '2030-05-10'].map((d) => prisma.appointment.create({ data: { ...appt, scheduled_date: day(d) } })));
      return { p, stay, appts };
    };

    // Cancel the missed days: Monday and Tuesday go, "arrived late"; Friday stays; the leaving day stays.
    const c = await guest('Cancel');
    const look = await call('GET', `/patients/${c.p.id}/stays/${c.stay.id}/preview?start_date=2030-05-09&end_date=2030-05-12`);
    assert.equal(look.missed, 2, 'the preview counts what is booked before the new arrival');
    const cut = await call('PUT', `/patients/${c.p.id}/stays/${c.stay.id}`, { start_date: '2030-05-09', end_date: '2030-05-12', late: 'cancel' });
    assert.equal(cut.cancelled, 2);
    const after = await prisma.appointment.findMany({ where: { id: { in: c.appts.map((a) => a.id) } }, orderBy: { scheduled_date: 'asc' } });
    assert.deepEqual(after.map((a) => [a.scheduled_date.toISOString().slice(0, 10), a.status, a.cancel_reason]), [['2030-05-06', 'cancelled', 'arrived late'], ['2030-05-07', 'cancelled', 'arrived late'], ['2030-05-10', 'confirmed', null]]);
    await call('POST', '/replan/undo', { batch_id: cut.batch_id });
    assert.equal(await prisma.appointment.count({ where: { id: { in: c.appts.map((a) => a.id) }, status: 'confirmed' } }), 3, 'Undo puts them back');

    // Push the stay later: every treatment moves three days, same time and therapist.
    const s = await guest('Shift');
    // A staged diet moves with the stay (#1255), not stretched from the old arrival.
    await prisma.dietPlanSegment.createMany({ data: [['2030-05-06', '2030-05-08'], ['2030-05-09', '2030-05-12']].map(([f, t]) => ({ patient_id: s.p.id, start_date: day(f), end_date: day(t), therapy_ids: [] })) });
    const pushed = await call('PUT', `/patients/${s.p.id}/stays/${s.stay.id}`, { start_date: '2030-05-09', end_date: '2030-05-15', late: 'shift' });
    const diet = await prisma.dietPlanSegment.findMany({ where: { patient_id: s.p.id }, orderBy: { start_date: 'asc' } });
    assert.deepEqual(diet.map((g) => [g.start_date.toISOString().slice(0, 10), g.end_date.toISOString().slice(0, 10)]), [['2030-05-09', '2030-05-11'], ['2030-05-12', '2030-05-15']], 'the diet moves three days with the stay');
    assert.equal(pushed.shifted, 3);
    const moved = await prisma.appointment.findMany({ where: { id: { in: s.appts.map((a) => a.id) } }, orderBy: { scheduled_date: 'asc' } });
    assert.deepEqual(moved.map((a) => [a.scheduled_date.toISOString().slice(0, 10), a.start_time, a.staff_id]), [['2030-05-09', '08:00', staff.id], ['2030-05-10', '08:00', staff.id], ['2030-05-13', '08:00', staff.id]]);
    assert.ok(Array.isArray(pushed.clashes), 'clashes are listed for the day check');
    // A pause (#1194): drop those days, or push the rest and the leaving day later.
    const d = await guest('Drop');
    const dropped = await call('POST', `/patients/${d.p.id}/stays/${d.stay.id}/pause`, { from: '2030-05-07', to: '2030-05-08', mode: 'drop', reason: 'fever' });
    assert.equal(dropped.changed, 1);
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: d.appts[1].id } })).cancel_reason, 'paused: fever');
    const k = await guest('Push');
    const later = await call('POST', `/patients/${k.p.id}/stays/${k.stay.id}/pause`, { from: '2030-05-07', to: '2030-05-08', mode: 'push' });
    assert.equal(later.end_date, '2030-05-14', 'the leaving day moves two days');
    const pushedK = await prisma.appointment.findMany({ where: { id: { in: k.appts.map((a) => a.id) } }, orderBy: { scheduled_date: 'asc' } });
    assert.deepEqual(pushedK.map((a) => a.scheduled_date.toISOString().slice(0, 10)), ['2030-05-06', '2030-05-09', '2030-05-12'], 'Monday stays; the rest move two days');
    const outside = await fetch(`${API_BASE}/patients/${k.p.id}/stays/${k.stay.id}/pause`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ from: '2030-06-01', to: '2030-06-02', mode: 'drop' }) });
    assert.equal(outside.status, 409, 'a pause outside the stay is refused');
    // Arrived hours late (#1240): away until 11:00 that day, so the 07:00 treatment moves later the same day, one pass; deleting it puts it back.
    const h = await guest('Hours');
    const away = await call('POST', '/timeoff', { entity_type: 'patient', entity_id: h.p.id, date: '2030-05-07', start_date: '2030-05-07', end_date: '2030-05-07', start_time: '00:00', end_time: '11:00', description: 'arrived late' });
    const tue = await prisma.appointment.findUniqueOrThrow({ where: { id: h.appts[1].id } });
    assert.equal(tue.scheduled_date.toISOString().slice(0, 10), '2030-05-07', 'it stays on the day');
    assert.ok(tue.start_time >= '11:00', `it moves after the arrival, not ${tue.start_time}`);
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: h.appts[0].id } })).start_time, '07:00', 'other days are left alone');
    await call('DELETE', `/timeoff/${away.id}`);
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: h.appts[1].id } })).start_time, '07:00', 'deleting the absence puts it back');
    console.log('late arrival and pause: cancel the missed days, or push the stay later, each undone in one tap');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
