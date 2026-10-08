/**
 * A centre moves between installs in one file (#231): export, then import the
 * same file, and every table comes back with the same rows. A file that is not
 * an export, or from another version, is refused and changes nothing.
 *
 * Round-trips the demo in place, so it needs a demo install. Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
    const auth = { Authorization: `Bearer ${token}` };
    const counts = async () => ({
      patients: await prisma.patient.count(), appointments: await prisma.appointment.count(), stays: await prisma.patientStay.count(),
      discharges: await prisma.patientStay.count({ where: { discharge: { not: Prisma.DbNull } } }), users: await prisma.user.count(),
      sheets: await prisma.printedSheet.count(), photos: await prisma.patientPhoto.count(), settings: JSON.stringify((await prisma.settings.findUnique({ where: { id: 'singleton' } }))?.letterhead),
    });
    await fetch(`${API_BASE}/daily-schedule-pdf?date=2030-06-03`, { headers: auth }); // one printed sheet, with bytes, in the file
    // A passport photo (#510): only a JPEG is taken, it reads back as sent, and it moves with the centre.
    const someone = await prisma.patient.findFirstOrThrow();
    const photoUrl = `${API_BASE}/patients/${someone.id}/passport-photo`;
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
    const putPhoto = (body: Buffer, type = 'image/jpeg') => fetch(photoUrl, { method: 'PUT', headers: { ...auth, 'Content-Type': type }, body: new Uint8Array(body) });
    assert.equal((await putPhoto(Buffer.from('not an image'))).status, 400, 'something that is not a JPEG is refused');
    assert.equal((await putPhoto(jpeg)).status, 200);
    assert.equal(Buffer.from(await (await fetch(photoUrl, { headers: auth })).arrayBuffer()).equals(jpeg), true, 'the photo reads back as sent');
    assert.equal((await fetch(photoUrl)).status, 401, 'signed out, no photo');
    const before = await counts();
    const file = Buffer.from(await (await fetch(`${API_BASE}/settings/export`, { headers: auth })).arrayBuffer());
    const parsed = JSON.parse(gunzipSync(file).toString());
    assert.equal(parsed.app, 'ayurcalm');

    const post = (body: Buffer) => fetch(`${API_BASE}/settings/import`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(body) });
    assert.equal((await post(Buffer.from('not a file'))).status, 409, 'a stray file is refused');
    assert.equal((await post(gzipSync(JSON.stringify({ ...parsed, version: 'older' })))).status, 409, 'another version is refused');
    assert.deepEqual(await counts(), before, 'a refused file changed nothing');

    const r = await post(file);
    assert.equal(r.status, 200, await r.clone().text());
    assert.deepEqual(await counts(), before, 'every table came back');
    const sheet = await prisma.printedSheet.findFirstOrThrow({ where: { date: '2030-06-03' } });
    assert.equal(Buffer.from(sheet.pdf).subarray(0, 4).toString(), '%PDF', 'a printed sheet came back as a PDF');
    assert.equal(Buffer.from(await (await fetch(photoUrl, { headers: auth })).arrayBuffer()).equals(jpeg), true, 'the photo came back with the centre');
    assert.equal((await fetch(photoUrl, { method: 'DELETE', headers: auth })).status, 200);
    assert.equal((await fetch(photoUrl, { headers: auth })).status, 404, 'removed');
    assert.equal((await fetch(`${API_BASE}/settings/export`)).status, 401, 'signed out, nothing');
    console.log(`transfer: ${file.length} bytes, ${before.patients} residents, ${before.appointments} treatments round-tripped`);
  } finally {
    await prisma.printedSheet.deleteMany({ where: { date: '2030-06-03' } });
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
