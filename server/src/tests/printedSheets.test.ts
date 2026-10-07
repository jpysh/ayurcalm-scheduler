/**
 * Printing a day keeps one copy of each of its sheets (#145): a second print
 * replaces the first, a therapist's own rota is not kept, and copies older
 * than 90 days go when the next one is saved.
 *
 * Its own day in 2030 and one in 2020, tidied afterwards. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const DAY = '2030-05-14';

async function main() {
  const prisma = new PrismaClient();
  const tidy = () => prisma.printedSheet.deleteMany({ where: { date: { in: [DAY, '2020-01-01'] } } });
  try {
    await tidy();
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const get = (path: string) => fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    await prisma.printedSheet.create({ data: { date: '2020-01-01', kind: 'residents', pdf: Buffer.from('old') } });

    assert.equal((await get(`/daily-schedule-pdf?date=${DAY}`)).status, 200);
    const first = await prisma.printedSheet.findUniqueOrThrow({ where: { date_kind: { date: DAY, kind: 'residents' } } });
    assert.equal((await get(`/daily-schedule-pdf?date=${DAY}`)).status, 200);
    assert.equal(await prisma.printedSheet.count({ where: { date: DAY, kind: 'residents' } }), 1, 'a second print replaces the first');
    assert.ok((await prisma.printedSheet.findUniqueOrThrow({ where: { date_kind: { date: DAY, kind: 'residents' } } })).printed_at >= first.printed_at);
    assert.equal(await prisma.printedSheet.count({ where: { date: '2020-01-01' } }), 0, 'older than 90 days is gone');

    await get(`/daily-schedule-pdf?date=${DAY}&view=therapist`);
    const staff = await prisma.staff.findFirstOrThrow({ where: { is_active: true } });
    await get(`/daily-schedule-pdf?date=${DAY}&staff_id=${staff.id}`);
    const kinds = (await prisma.printedSheet.findMany({ where: { date: DAY } })).map((r) => r.kind).sort();
    assert.deepEqual(kinds, ['residents', 'therapist'], "one person's rota is not kept");

    const list = await (await get('/printed-sheets')).json();
    assert.ok(list.some((r: { date: string; kind: string }) => r.date === DAY && r.kind === 'therapist'));
    const copy = await get(`/printed-sheets/${DAY}/residents`);
    assert.equal(copy.headers.get('content-type'), 'application/pdf');
    assert.ok(Buffer.from(await copy.arrayBuffer()).subarray(0, 4).toString() === '%PDF');
    assert.equal((await fetch(`${API_BASE}/printed-sheets`)).status, 401, 'signed out, nothing');
    // Records for a month (#488): a PDF for a real month, refused for a made-up one.
    const records = await get(`/records-pdf?month=${new Date().toISOString().slice(0, 7)}`);
    assert.equal(records.headers.get('content-type'), 'application/pdf');
    assert.ok(Buffer.from(await records.arrayBuffer()).subarray(0, 4).toString() === '%PDF');
    assert.ok(!(await get('/records-pdf?month=2030-13')).ok, 'month 13 was accepted');
    console.log('printed sheets: kept, replaced, pruned; records for a month print');
  } finally {
    await tidy();
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
