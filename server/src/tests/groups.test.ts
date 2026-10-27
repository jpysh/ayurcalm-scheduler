/**
 * Group bookings (#1196): stays share a group name, the group is listed with its dates, and the organiser's
 * new dates move everyone not yet here in one action, treatments and all; whoever cannot move is named.
 *
 * Its own days in 2030, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Grouptest';
const GROUP = `${TAG} Yoga`;
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

async function tidy(prisma: PrismaClient) {
  const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.dietPlanSegment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  await prisma.programEvent.deleteMany({ where: { group_name: { startsWith: TAG } } });
  await prisma.groupHold.deleteMany({ where: { group_name: { startsWith: TAG } } });
  await prisma.guestRoom.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.accommodationType.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const raw = (method: string, path: string, body?: unknown) => fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const call = async (method: string, path: string, body?: unknown) => { const r = await raw(method, path, body); assert.ok(r.ok, `${method} ${path}: ${r.status} ${await r.clone().text()}`); return r.json(); };
    const house = await prisma.accommodationType.findFirstOrThrow();
    await call('POST', '/guest-rooms', { name: `${TAG}1`, accommodation_id: house.id });
    const room = (await prisma.guestRoom.findUniqueOrThrow({ where: { name: `${TAG}1` } })).id;
    const [therapy, staff, troom] = await Promise.all([prisma.therapy.findFirstOrThrow({ where: { is_consultation: false } }), prisma.staff.findFirstOrThrow({ where: { is_active: true } }), prisma.therapyRoom.findFirstOrThrow()]);

    const a = await call('POST', '/patients', { name: `${TAG} Asha`, gender: 'female', group_name: GROUP, stay: { start_date: '2030-09-01', end_date: '2030-09-08' } });
    const b = await call('POST', '/patients', { name: `${TAG} Bina`, gender: 'female', group_name: GROUP, guest_room_id: room, stay: { start_date: '2030-09-01', end_date: '2030-09-08' } });
    await call('POST', '/patients', { name: `${TAG} Blocker`, gender: 'female', guest_room_id: room, stay: { start_date: '2030-09-09', end_date: '2030-09-15' } });
    const t = await prisma.appointment.create({ data: { patient_id: a.id, therapy_id: therapy.id, staff_id: staff.id, room_id: troom.id, scheduled_date: day('2030-09-02'), start_time: '07:00', duration_minutes: therapy.duration_minutes, co_staff_ids: [], session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual' } });

    const groups = await call('GET', '/groups');
    const g = groups.find((x: { name: string }) => x.name === GROUP);
    assert.deepEqual([g.count, g.start_date, g.end_date], [2, '2030-09-01', '2030-09-08'], 'the group is listed with its dates');

    // Three days later: Asha moves with her treatment; Bina's room is taken from the 9th, so she is named, not moved.
    const out = await call('POST', '/groups/move', { name: GROUP, days: 3 });
    assert.deepEqual(out.moved, [`${TAG} Asha`]);
    assert.equal(out.not_moved.length, 1);
    assert.equal(out.not_moved[0].name, `${TAG} Bina`);
    assert.equal((await prisma.patientStay.findFirstOrThrow({ where: { patient_id: a.id } })).start_date.toISOString().slice(0, 10), '2030-09-04');
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } })).scheduled_date.toISOString().slice(0, 10), '2030-09-05', 'the treatment moves with her');
    assert.equal((await prisma.patientStay.findFirstOrThrow({ where: { patient_id: b.id } })).start_date.toISOString().slice(0, 10), '2030-09-01', 'Bina stays where she was');

    // Undo is the same move back.
    await call('POST', '/groups/move', { name: GROUP, days: -3 });
    assert.equal((await prisma.patientStay.findFirstOrThrow({ where: { patient_id: a.id } })).start_date.toISOString().slice(0, 10), '2030-09-01');
    console.log('groups: listed with their dates, moved together, whoever cannot move is named, and moved back');

    // Held rooms (#1196 part 2): two of three rooms of a type held for a group before the names arrive.
    const hut = await prisma.accommodationType.create({ data: { name: `${TAG} Hut`, price_per_day: 1 } });
    for (const n of ['H1', 'H2', 'H3']) await call('POST', '/guest-rooms', { name: `${TAG}${n}`, accommodation_id: hut.id });
    const HELD = `${TAG} Retreat`;
    const free = async () => (await call('GET', `/guest-rooms/free?from=2030-10-01&to=2030-10-06`)).filter((r: { type: string; free: boolean }) => r.type === hut.name && r.free).length;
    const tooMany = await raw('PUT', '/groups/hold', { name: HELD, start_date: '2030-10-01', end_date: '2030-10-06', rooms: [{ accommodation_id: hut.id, rooms: 4 }] });
    assert.equal(tooMany.status, 409, 'four of three rooms cannot be held');
    await call('PUT', '/groups/hold', { name: HELD, start_date: '2030-10-01', end_date: '2030-10-06', rooms: [{ accommodation_id: hut.id, rooms: 2 }] });
    assert.equal(await free(), 1, 'two of the three huts show as taken to everyone else');
    const held = (await call('GET', '/groups')).find((x: { name: string }) => x.name === HELD);
    assert.deepEqual([held.count, held.holds[0].rooms, held.holds[0].filled], [0, 2, 0], 'the group is listed before any name');
    const outsider = await raw('POST', '/patients', { name: `${TAG} Outsider`, gender: 'male', guest_room_id: (await prisma.guestRoom.findUniqueOrThrow({ where: { name: `${TAG}H1` } })).id, stay: { start_date: '2030-10-02', end_date: '2030-10-04' } });
    assert.equal((await outsider.json()).reason, 'ROOM_HELD', 'a guest outside the group cannot take a held hut');
    // The organiser's list: each name takes a held hut, and the hold shrinks as it fills.
    const c = await call('POST', '/patients', { name: `${TAG} Chitra`, gender: 'female', group_name: HELD, stay: { start_date: '2030-10-01', end_date: '2030-10-06' } });
    const cRoom = (await prisma.patientStay.findFirstOrThrow({ where: { patient_id: c.id }, include: { GuestRoom: true } })).GuestRoom;
    assert.equal(cRoom?.accommodation_id, hut.id, 'a guest from the list is given a held hut');
    assert.equal(await free(), 1, 'one held and one filled: still one hut free');
    assert.equal((await call('GET', '/groups')).find((x: { name: string }) => x.name === HELD).holds[0].filled, 1);
    await call('PUT', '/groups/hold', { name: HELD, start_date: '2030-10-01', end_date: '2030-10-06', rooms: [{ accommodation_id: hut.id, rooms: 0 }] });
    assert.equal(await free(), 2, 'letting the hold go frees the hut nobody was named for');
    console.log('groups: rooms held before the names, taken to others, filled from the list, and let go');

    // The shared programme (#1196 part 3): a class at 11 for the group, each guest's own treatment on top.
    const part = await call('POST', '/groups/programme', { name: GROUP, activity_name: `${TAG} Yoga class`, start_time: '11:00', end_time: '11:30' });
    assert.equal((await call('GET', '/groups')).find((x: { name: string }) => x.name === GROUP).programme[0].id, part.id, 'the programme is on the group');
    const solo = await prisma.therapy.findFirstOrThrow({ where: { is_consultation: false, staff_required: 1, once_per_course: false, before_purification: false } });
    // The guard picks a therapist and room that fit at 10:45, so a day off or a missing skill never hides the note.
    // Any start from 10:30 to 11:00 runs an hour through the 11:00 class.
    const fit = async (patient: string, needed = true) => { const o = await call('GET', `/appointments/options?date=2030-09-03&patient_id=${patient}&therapy_id=${solo.id}&at=10:45`); const t = o.times.find((x: { start_time: string }) => x.start_time >= '10:30' && x.start_time <= '11:00'); if (!t && !needed) return null; assert.ok(t, `a time across 11:00 is offered: ${JSON.stringify(o.times.map((x: { start_time: string }) => x.start_time))}`); return { staff_id: t.staff_id as string, room_id: (t.room_id ?? o.rooms[0].id) as string, start_time: t.start_time as string }; };
    const mine = (await fit(a.id))!;
    const across = await prisma.appointment.create({ data: { patient_id: a.id, therapy_id: solo.id, scheduled_date: day('2030-09-03'), ...mine, duration_minutes: 60, co_staff_ids: [], session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual' } });
    const outsiderStay = await call('POST', '/patients', { name: `${TAG} Solo`, gender: 'female', stay: { start_date: '2030-09-01', end_date: '2030-09-08' } });
    // A small team may have nobody left at that hour for the outsider; then only the group guest is checked.
    const theirs = await fit(outsiderStay.id, false);
    if (theirs) await prisma.appointment.create({ data: { patient_id: outsiderStay.id, therapy_id: solo.id, scheduled_date: day('2030-09-03'), ...theirs, duration_minutes: 60, co_staff_ids: [], session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual' } });
    const all = (await call('GET', '/day-check?date=2030-09-03')).problems;
    const checked = all.filter((p: { kind: string; what: string }) => p.kind === 'EVENT_OVERLAP' && p.what.includes(`${TAG} Yoga class`));
    assert.deepEqual(checked.map((p: { appointment_id: string }) => p.appointment_id), [across.id], "only the group's guest is told the treatment runs through their yoga");
    const sheet = await raw('GET', '/daily-schedule-pdf?date=2030-09-03');
    assert.equal(sheet.status, 200);
    await raw('DELETE', `/groups/programme/${part.id}`);
    assert.equal((await call('GET', '/groups')).find((x: { name: string }) => x.name === GROUP).programme.length, 0);
    console.log('groups: a shared programme for the group only, with own treatments on top');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
