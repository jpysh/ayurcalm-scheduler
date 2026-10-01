/**
 * #285 stories 7 to 12 on the server: meals by date, what a discharge summary lacks, a
 * shortened stay that cancels with a reason and can be undone, the package and
 * accommodation catalogues, and how many treatments a leave would leave without a therapist.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Storytest';

async function tidy(prisma: PrismaClient) {
  const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.dietPlanSegment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  await prisma.therapy.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.package.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.accommodationType.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const raw = (method: string, path: string, body?: unknown) => fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await raw(method, path, body);
      assert.ok(res.ok, `${method} ${path}: ${res.status} ${await res.clone().text()}`);
      return res.status === 204 ? null : res.json();
    };

    const [light, pitta] = await prisma.dietTemplate.findMany({ orderBy: { name: 'asc' }, take: 2 });
    const p = await call('POST', '/patients', { name: `${TAG} Ananya`, gender: 'female', stay: { start_date: '2030-03-01', end_date: '2030-03-14' }, template_id: light.id });
    const stay = p.Stays[0];

    // Story 7: a plan from a date ends the one before it the day earlier and runs to the leaving date.
    let t = await call('GET', `/patients/${p.id}/diet?date=2030-03-02`);
    assert.deepEqual(t.entries.map((e: { from: string; to: string }) => [e.from, e.to]), [['2030-03-01', '2030-03-14']]);
    t = await call('POST', `/patients/${p.id}/diet`, { from: '2030-03-06', template_id: pitta.id });
    assert.deepEqual(t.entries.map((e: { from: string; to: string; name: string }) => [e.from, e.to, e.name]), [['2030-03-01', '2030-03-05', light.name], ['2030-03-06', '2030-03-14', pitta.name]], 'each plan starts where the last ended');
    assert.equal((await raw('POST', `/patients/${p.id}/diet`, { from: '2030-04-01', template_id: pitta.id })).status, 400, 'a date outside the stay is refused');
    t = await call('POST', `/patients/${p.id}/diet`, { from: '2030-03-01', template_id: pitta.id });
    assert.equal(t.entries.length, 1, 'starting a plan on the first day replaces everything');

    // Story 8: what the summary lacks, and what the card already holds fills it.
    let day = await call('GET', `/patients/${p.id}/day?date=2030-03-02`);
    assert.equal(day.stay.discharge.total, 8);
    assert.ok(day.stay.discharge.missing.some((m: { key: string }) => m.key === 'address'));
    await call('PUT', `/patients/${p.id}`, { address: '12 Lake Road', emergency_phone: '9811111111' });
    day = await call('GET', `/patients/${p.id}/day?date=2030-03-02`);
    assert.ok(!day.stay.discharge.missing.some((m: { key: string }) => m.key === 'address' || m.key === 'emergency_phone'), 'details typed on the card count as ready');
    assert.equal((await call('GET', `/patients/${p.id}/stays/${stay.id}/discharge`)).draft.address, '12 Lake Road', 'the summary starts from the card');

    // Stories 11 and 12: the catalogues, and a retired one stays readable.
    const pack = await call('POST', '/packages', { name: `${TAG} 14 days`, days: 14, price: 70750 });
    assert.equal((await raw('POST', '/packages', { name: `${TAG} 14 days`, days: 14, price: 1 })).status, 409, 'a second package with the same name is refused');
    const house = await call('POST', '/accommodations', { name: `${TAG} House`, price_per_day: 2500 });
    await call('PUT', `/patients/${p.id}/stays/${stay.id}`, { package_id: pack.id, accommodation_id: house.id, room_number: 'N-4' });
    day = await call('GET', `/patients/${p.id}/day?date=2030-03-02`);
    assert.equal(day.stay.package.price, 70750);
    assert.equal(day.stay.accommodation.room_number, 'N-4');
    assert.equal((await call('DELETE', `/packages/${pack.id}`)).retired, true, 'a package a stay chose is retired, not deleted');
    assert.equal((await prisma.package.findUnique({ where: { id: pack.id } }))?.is_active, false);

    // Story 10: shortening cancels what is left with its reason, in one batch; Undo puts it back.
    const therapy = await prisma.therapy.create({ data: { name: `${TAG} Abhyanga`, required_amenities: [], duration_minutes: 60 } });
    const book = (date: string) => prisma.appointment.create({ data: { patient_id: p.id, therapy_id: therapy.id, scheduled_date: new Date(`${date}T00:00:00.000Z`), start_time: '10:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual' } });
    const kept = await book('2030-03-05');
    const after = await book('2030-03-10');
    const preview = await call('GET', `/patients/${p.id}/stays/${stay.id}/preview?end_date=2030-03-08`);
    assert.deepEqual(preview.cancels.map((a: { id: string }) => a.id), [after.id], 'the preview names what a shortened stay would cancel');
    const out = await call('PUT', `/patients/${p.id}/stays/${stay.id}`, { start_date: '2030-03-01', end_date: '2030-03-08', cancel_after: true });
    assert.equal(out.cancelled, 1);
    const gone = await prisma.appointment.findUnique({ where: { id: after.id } });
    assert.equal(gone?.status, 'cancelled');
    assert.equal(gone?.cancel_reason, 'stay shortened', 'the reason is kept with the treatment');
    assert.equal((await prisma.appointment.findUnique({ where: { id: kept.id } }))?.status, 'pending');
    await call('POST', '/replan/undo', { batch_id: out.batch_id });
    const back = await prisma.appointment.findUnique({ where: { id: after.id } });
    assert.equal(back?.status, 'pending');
    assert.equal(back?.cancel_reason, null, 'Undo clears the reason with the cancellation');

    // Extending: the plan that ran to the old leaving date runs to the new one.
    await call('PUT', `/patients/${p.id}/stays/${stay.id}`, { start_date: '2030-03-01', end_date: '2030-03-20' });
    t = await call('GET', `/patients/${p.id}/diet?date=2030-03-02`);
    assert.equal(t.entries[t.entries.length - 1].to, '2030-03-20');

    // Story 9: how many treatments a leave leaves without its therapist, and Save, plan later moves nothing.
    const staff = (await prisma.staff.findFirst({ where: { is_active: true } }))!;
    await prisma.appointment.update({ where: { id: kept.id }, data: { staff_id: staff.id } });
    assert.equal((await call('GET', `/timeoff/impact?staff_id=${staff.id}&from=2030-03-05&to=2030-03-05`)).treatments, 1);
    assert.equal((await call('GET', `/timeoff/impact?staff_id=${staff.id}&from=2030-03-06&to=2030-03-07`)).treatments, 0);
    const leave = await call('POST', '/timeoff', { entity_type: 'staff', entity_id: staff.id, start_date: '2030-03-05T09:00', end_date: '2030-03-05T18:00', plan: false });
    assert.equal(leave.replan, null, 'plan later records the leave and rebuilds nothing');
    assert.equal((await prisma.appointment.findUnique({ where: { id: kept.id } }))?.staff_id, staff.id);
    await call('DELETE', `/timeoff/${leave.id}`);

    console.log('Patient stories: meals by date, what the summary lacks, package and accommodation, a shortened stay cancelled with its reason and undone, a leave planned later.');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
