/**
 * A guest room on every stay (#456): a room is refused on any night it has no bed left,
 * and the refusal names the rooms free for all those nights; a room frees on the day its
 * guest leaves; a two-bed room takes a couple; new dates re-check the room and the save
 * moves them to the room the preview named; the room prints beside the name.
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
import { generateGuestRoomsSheetPdf } from '../pdf/guestRoomsSheetPdf.js';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Roomtest';

async function tidy(prisma: PrismaClient) {
  const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  await prisma.timeOff.deleteMany({ where: { description: TAG } });
  await prisma.accommodationType.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  const prisma = new PrismaClient();
  const dir = mkdtempSync(join(tmpdir(), 'room-'));
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const raw = (method: string, path: string, body?: unknown) => fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const call = async (method: string, path: string, body?: unknown) => { const r = await raw(method, path, body); assert.ok(r.ok, `${method} ${path}: ${r.status} ${await r.clone().text()}`); return r.json(); };

    const house = await prisma.accommodationType.create({ data: { name: `${TAG} House`, price_per_day: 1000 } });
    await call('POST', '/guest-rooms', { name: `${TAG}1–${TAG}2`, accommodation_id: house.id });
    await call('POST', '/guest-rooms', { name: `${TAG}D`, accommodation_id: house.id, beds: 2 });
    const room = async (n: string) => (await prisma.guestRoom.findUniqueOrThrow({ where: { name: `${TAG}${n}` } })).id;
    const add = (name: string, start_date: string, end_date: string, guest_room_id: string) => raw('POST', '/patients', { name: `${TAG} ${name}`, gender: 'female', stay: { start_date, end_date }, guest_room_id });

    // Over-full on one night is refused, naming who is in it and the rooms free for every night.
    const asha = await (await add('Asha', '2030-03-01', '2030-03-10', await room('1'))).json();
    assert.equal(asha.Stays[0].guest_room_id, await room('1'));
    assert.equal(asha.Stays[0].accommodation_id, house.id, 'a guest room sets the accommodation to its type');
    const clash = await add('Bina', '2030-03-09', '2030-03-15', await room('1'));
    assert.equal(clash.status, 409);
    const why = await clash.json();
    assert.equal(why.reason, 'ROOM_TAKEN');
    assert.match(why.message, new RegExp(`${TAG}1 is taken on Sat 9 Mar by ${TAG} Asha`));
    assert.ok(why.free.some((r: { name: string }) => r.name === `${TAG}2`) && why.message.includes(`${TAG}2 (${TAG} House)`), 'the refusal names a free room of the same type');
    assert.equal(await prisma.patient.count({ where: { name: `${TAG} Bina` } }), 0, 'a refused patient is not half saved');

    // The room frees on the day its guest leaves.
    const bina = await add('Bina', '2030-03-10', '2030-03-15', await room('1'));
    assert.equal(bina.status, 201, 'arriving the day the last guest leaves is fine');
    const binaStay = (await bina.json()).Stays[0];

    // A two-bed room takes a couple, and no third.
    for (const n of ['Chetan', 'Chitra']) assert.equal((await add(n, '2030-03-02', '2030-03-06', await room('D'))).status, 201, 'a couple shares a two-bed room');
    assert.equal((await add('Dev', '2030-03-05', '2030-03-07', await room('D'))).status, 409, 'a third is refused');

    // New dates re-check the room: the preview names the room the save moves them to.
    const preview = await call('GET', `/patients/${asha.id}/stays/${asha.Stays[0].id}/preview?start_date=2030-03-01&end_date=2030-03-12`);
    assert.match(preview.room.taken, new RegExp(`${TAG}1 is taken on Sun 10 Mar by ${TAG} Bina`));
    assert.equal(preview.room.move_to.name, `${TAG}2`);
    assert.equal((await raw('PUT', `/patients/${asha.id}/stays/${asha.Stays[0].id}`, { start_date: '2030-03-01', end_date: '2030-03-12' })).status, 409, 'longer dates that over-fill the room are refused');
    await call('PUT', `/patients/${asha.id}/stays/${asha.Stays[0].id}`, { start_date: '2030-03-01', end_date: '2030-03-12', guest_room_id: preview.room.move_to.id });
    assert.equal((await prisma.patientStay.findUniqueOrThrow({ where: { id: asha.Stays[0].id } })).guest_room_id, await room('2'));
    assert.equal((await call('GET', `/patients/${binaStay.patient_id}/day?date=2030-03-11`)).stay.accommodation.room.name, `${TAG}1`, 'the card names the guest room');

    // The room prints beside the name.
    const pdf = join(dir, 'day.pdf');
    writeFileSync(pdf, await generateDailySchedulePdf('2030-03-04', prisma));
    const text = execFileSync('pdftotext', ['-raw', pdf, '-']).toString().replace(/\s+/g, ' ');
    assert.ok(text.includes(`${TAG} Asha ${TAG}2`), 'the day sheet prints the guest room under the name');
    assert.ok(text.includes(`${TAG} Chetan ${TAG}D`), 'and the couple\'s room');

    // Three guests leaving on different days: the housekeeper's sheet prints every name and date, never an ellipsis.
    await call('POST', '/guest-rooms', { name: `${TAG}F`, accommodation_id: house.id, beds: 3 });
    for (const [n, end] of [['Gangadharan Venkataraman', '2030-04-08'], ['Parvathi Subramaniam', '2030-04-09'], ['Lakshminarayanan Iyer', '2030-04-10']]) {
      assert.equal((await add(n, '2030-04-01', end, await room('F'))).status, 201);
    }
    const sheet = join(dir, 'rooms.pdf');
    writeFileSync(sheet, await generateGuestRoomsSheetPdf('2030-04-03', prisma));
    const rooms = execFileSync('pdftotext', ['-raw', sheet, '-']).toString().replace(/\s+/g, ' ');
    assert.ok(rooms.includes(`${TAG} Lakshminarayanan Iyer until Wed 10 Apr`), `the guest rooms sheet prints the third guest whole: ${rooms}`);
    assert.ok(!rooms.includes('…'), `and cuts no line: ${rooms}`);

    // A move mid-stay (#1164) is checked only from the move, and the nights before it stay in the old room.
    const sunil = await (await add('Sunil', '2030-05-01', '2030-05-15', await room('1'))).json();
    assert.equal((await add('Kiran', '2030-05-01', '2030-05-07', await room('2'))).status, 201);
    const sunilStay = `/patients/${sunil.id}/stays/${sunil.Stays[0].id}`;
    await call('PUT', sunilStay, { guest_room_id: await room('2'), move_from: '2030-05-07' });
    await call('PUT', sunilStay, { guest_room_id: await room('1'), move_from: '2030-05-07' });
    assert.equal(await prisma.earlierGuestRoom.count({ where: { stay_id: sunil.Stays[0].id } }), 0, 'Undo on the same day leaves no earlier room');
    await call('PUT', sunilStay, { guest_room_id: await room('2'), move_from: '2030-05-07' });
    assert.equal((await add('Tara', '2030-05-03', '2030-05-05', await room('1'))).status, 409, 'the old room stays taken on the nights before the move');
    assert.equal((await add('Tara', '2030-05-07', '2030-05-09', await room('1'))).status, 201, 'and is free from the move');
    // Out of use is read per night (#1177): the room moved to before the move is no warning, the room left after it is one.
    const sunilOut = async () => (await call('GET', '/attention?date=2030-05-01')).items.filter((i: { who: string; rule: string }) => i.rule === 'room_out' && i.who === `${TAG} Sunil`).map((i: { what: string }) => i.what);
    await call('POST', '/timeoff', { entity_type: 'guest_room', entity_id: await room('2'), date: '2030-05-03', description: TAG });
    assert.deepEqual(await sunilOut(), [], 'the room they move to later is not theirs yet');
    await call('POST', '/timeoff', { entity_type: 'guest_room', entity_id: await room('1'), date: '2030-05-04', description: TAG });
    assert.deepEqual(await sunilOut(), [`${TAG}1 is not available from Sat 4 May: ${TAG}`], 'the room they are in before the move is');
    await prisma.timeOff.deleteMany({ where: { description: TAG } });
    writeFileSync(sheet, await generateGuestRoomsSheetPdf('2030-05-07', prisma));
    const moveDay = execFileSync('pdftotext', ['-raw', sheet, '-']).toString().replace(/\s+/g, ' ');
    assert.ok(moveDay.includes(`${TAG} Sunil leaves today`) || moveDay.includes(`Make up, then ready for ${TAG} Tara`), `on the day of the move the old room is made up: ${moveDay}`);
    assert.ok(moveDay.includes(`${TAG} Sunil until Wed 15 May (arrives today)`) || moveDay.includes(`ready for ${TAG} Sunil`), `and the new one readied: ${moveDay}`);
    for (const [d, n] of [['2030-05-03', '1'], ['2030-05-10', '2']]) {
      writeFileSync(pdf, await generateDailySchedulePdf(d, prisma));
      assert.ok(execFileSync('pdftotext', ['-raw', pdf, '-']).toString().replace(/\s+/g, ' ').includes(`${TAG} Sunil ${TAG}${n}`), `the day sheet for ${d} prints the room slept in that night`);
    }
    // Shortened to end before the move (#1174): the stay ends in the room it never left.
    await call('PUT', sunilStay, { start_date: '2030-05-01', end_date: '2030-05-06' });
    const short = await prisma.patientStay.findUniqueOrThrow({ where: { id: sunil.Stays[0].id }, include: { EarlierRooms: true } });
    assert.deepEqual([short.guest_room_id, short.EarlierRooms.length], [await room('1'), 0], 'a stay shortened before its move stays in the old room');
    // A double tap (#1198): the same New stay, or the same new resident, sent twice at once is saved once.
    const twice = (path: string, body: unknown) => Promise.all([raw('POST', path, body), raw('POST', path, body)]);
    const solo = await (await add('Solo', '2030-01-01', '2030-01-03', await room('2'))).json();
    const stays = await twice(`/patients/${solo.id}/stays`, { start_date: '2030-08-01', end_date: '2030-08-05' });
    assert.deepEqual(stays.map((r) => r.status).sort(), [201, 409], 'one New stay saved, the second refused');
    assert.equal((await stays.find((r) => r.status === 409)!.json()).reason, 'STAY_OVERLAPS');
    assert.equal(await prisma.patientStay.count({ where: { patient_id: solo.id, start_date: new Date('2030-08-01T00:00:00Z') } }), 1);
    const back = await raw('POST', `/patients/${solo.id}/stays`, { start_date: '2030-08-05', end_date: '2030-08-09' });
    assert.equal(back.status, 201, 'a stay starting on the leaving day of another is not an overlap');
    const newcomer = { name: `${TAG} Twice`, gender: 'female', stay: { start_date: '2030-08-01', end_date: '2030-08-05' } };
    await twice('/patients', newcomer);
    assert.equal(await prisma.patient.count({ where: { name: `${TAG} Twice` } }), 1, 'one resident, not two');
    const two = await room('2');
    await twice('/patients', { name: `${TAG} Last`, gender: 'female', stay: { start_date: '2030-09-01', end_date: '2030-09-03' }, guest_room_id: two });
    const both = await twice('/patients', { name: `${TAG} Rival`, gender: 'female', stay: { start_date: '2030-09-01', end_date: '2030-09-03' }, guest_room_id: two });
    assert.deepEqual(both.map((r) => r.status).sort(), [409, 409], 'the last bed, once taken, is refused to everyone after');

    // A returning guest's New stay takes its room in the same save (#1190), checked like a new resident's.
    const again = await call('POST', `/patients/${solo.id}/stays`, { start_date: '2030-10-01', end_date: '2030-10-05', guest_room_id: two });
    assert.equal(again.guest_room_id, two, 'the New stay has its room');
    const clashAgain = await raw('POST', `/patients/${asha.id}/stays`, { start_date: '2030-10-02', end_date: '2030-10-04', guest_room_id: two });
    assert.equal(clashAgain.status, 409, 'a taken room is refused for a New stay too');
    // A day patient sleeps at home (#1189): giving them a room is refused, never saved unchecked.
    const day = await (await raw('POST', '/patients', { name: `${TAG} Daypatient`, gender: 'female', on_site: false, stay: { start_date: '2030-10-01', end_date: '2030-10-05' } })).json();
    const roomForDay = await raw('PUT', `/patients/${day.id}/stays/${day.Stays[0].id}`, { guest_room_id: two, move_from: '2030-10-01' });
    assert.equal(roomForDay.status, 409);
    assert.equal((await roomForDay.json()).reason, 'NOT_ON_SITE');

    console.log('guest room stays: ok');
  } finally {
    await tidy(prisma).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
