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
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Roomtest';

async function tidy(prisma: PrismaClient) {
  const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
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
    assert.ok(text.includes(`${TAG} Asha · ${TAG}2`) || text.includes(`Asha · ${TAG}2`), 'the day sheet prints the guest room beside the name');
    assert.ok(text.includes(`· ${TAG}D`), 'and the couple\'s room');
    console.log('guest room stays: ok');
  } finally {
    await tidy(prisma).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
