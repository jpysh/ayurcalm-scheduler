/**
 * The AI assistant's door (#119): the admin's own Claude reads the centre, and
 * nothing else gets in.
 *
 * Goes through the same download the Settings button makes, pulls the key out
 * of the extension file, and talks to /mcp as Claude Desktop would, on a day in
 * 2030 built here:
 *
 *   - no key, a wrong key and a revoked key are all refused
 *   - the tool list is the four read tools and stays small
 *   - every action answers from the day as it is: the resident, the treatment
 *     with both therapists, the therapist on leave flagged by check, the free
 *     therapist, the day sheet as a real PDF
 *   - reading writes nothing
 *
 * Needs a running server and its database: API_BASE and DATABASE_URL.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const TAG = 'Mcptest';
const DAY = '2030-05-14';
const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const MCP = API_BASE.replace(/\/api$/, '/mcp');
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'demo1234';
// What the tool definitions may cost a conversation before it starts. Raise it
// deliberately, never to make a new tool fit.
const TOOL_LIST_BUDGET_BYTES = 6000;
const allDay = Object.fromEntries(
  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '18:00' }]),
);

async function tidy(prisma: PrismaClient) {
  const patients = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } } })).map((p) => p.id);
  const staff = (await prisma.staff.findMany({ where: { name: { startsWith: TAG } } })).map((s) => s.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patient.deleteMany({ where: { id: { in: patients } } });
  await prisma.timeOff.deleteMany({ where: { entity_id: { in: staff } } });
  await prisma.staff.deleteMany({ where: { id: { in: staff } } });
  await prisma.therapyRoom.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapy.deleteMany({ where: { name: { startsWith: TAG } } });
}

/** The one file in a zip we care about. The extension is a plain deflated zip. */
function fileInZip(zip: Buffer, name: string): string {
  let at = 0;
  while (zip.readUInt32LE(at) === 0x04034b50) {
    const size = zip.readUInt32LE(at + 18);
    const nameLen = zip.readUInt16LE(at + 26);
    const extra = zip.readUInt16LE(at + 28);
    const start = at + 30 + nameLen + extra;
    if (zip.subarray(at + 30, at + 30 + nameLen).toString() === name) {
      return zlib.inflateRawSync(zip.subarray(start, start + size)).toString();
    }
    at = start + size;
  }
  throw new Error(`${name} is not in the extension`);
}

let nextId = 1;
async function rpc(key: string | null, method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  const text = await res.text();
  const body = (res.headers.get('content-type') || '').includes('text/event-stream')
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean).pop() || '{}'
    : text || '{}';
  return { status: res.status, body: JSON.parse(body) };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await requireDemoData(prisma);
    await tidy(prisma);

    const login = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    assert.ok(login.ok, `Sign-in failed with ${login.status}`);
    const { token } = await login.json();
    const admin = { Authorization: `Bearer ${token}` };

    // A day: two therapists share a pair treatment, a third is on leave.
    const day = new Date(`${DAY}T00:00:00.000Z`);
    const pair = await prisma.therapy.create({ data: { name: `${TAG} Pizhichil`, required_amenities: [], duration_minutes: 60, staff_required: 2 } });
    const room = await prisma.therapyRoom.create({ data: { name: `${TAG} Room`, amenities: [], weekly_schedule: allDay } });
    const staff = (name: string) =>
      prisma.staff.create({ data: { name: `${TAG} ${name}`, gender: 'female', specializations: [pair.id], weekly_schedule: allDay } });
    const [meera, asha, ravi] = [await staff('Meera'), await staff('Asha'), await staff('Ravi')];
    await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: ravi.id, date: day, description: 'Sick leave' } });
    const resident = await prisma.patient.create({ data: { name: `${TAG} Resident`, gender: 'female' } });
    await prisma.patientStay.create({ data: { patient_id: resident.id, start_date: new Date('2030-05-10T00:00:00.000Z'), end_date: new Date('2030-05-24T00:00:00.000Z'), duration_days: 14 } });
    const treatment = await prisma.appointment.create({ data: {
      patient_id: resident.id, therapy_id: pair.id, staff_id: meera.id, co_staff_ids: [asha.id], room_id: room.id,
      scheduled_date: day, start_time: '10:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual',
    } });
    // Ravi also still has one treatment on his day off, for check to find.
    await prisma.appointment.create({ data: {
      patient_id: resident.id, therapy_id: pair.id, staff_id: ravi.id, co_staff_ids: [asha.id], room_id: room.id,
      scheduled_date: day, start_time: '14:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual',
    } });

    // The download is the connection: its manifest carries the address and key.
    const download = await fetch(`${API_BASE}/mcp-key/extension`, { method: 'POST', headers: admin });
    assert.equal(download.status, 200, 'the Settings download failed');
    const manifest = JSON.parse(fileInZip(Buffer.from(await download.arrayBuffer()), 'manifest.json'));
    const key: string = manifest.server.mcp_config.env.AYURCALM_KEY;
    assert.match(key, /^acm_/);
    assert.match(manifest.server.mcp_config.env.AYURCALM_URL, /\/mcp$/);
    const stored = await prisma.serverSecret.findUnique({ where: { id: 'singleton' } });
    assert.ok(stored?.mcp_key_hash && !stored.mcp_key_hash.includes(key), 'the key is stored in the clear');

    // A staff login cannot make a key, and trying leaves the admin's in place.
    const staffEmail = `${TAG.toLowerCase()}-staff@example.com`;
    await prisma.user.deleteMany({ where: { email: staffEmail } });
    const made = await fetch(`${API_BASE}/users`, {
      method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: staffEmail, name: 'Staff', role: 'staff', password: 'staffpass123' }),
    });
    assert.ok(made.ok, `could not create a staff login: ${made.status}`);
    const staffLogin = await (await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: staffEmail, password: 'staffpass123' }),
    })).json();
    const staffTry = await fetch(`${API_BASE}/mcp-key/extension`, { method: 'POST', headers: { Authorization: `Bearer ${staffLogin.token}` } });
    await prisma.user.deleteMany({ where: { email: staffEmail } });
    assert.equal(staffTry.status, 403, 'a staff login made an assistant key');
    assert.equal((await prisma.serverSecret.findUnique({ where: { id: 'singleton' } }))?.mcp_key_hash, stored.mcp_key_hash, 'the refused request replaced the key');

    // Nobody without the key.
    assert.equal((await rpc(null, 'tools/list')).status, 401, 'no key was let in');
    assert.equal((await rpc('acm_wrong', 'tools/list')).status, 401, 'a wrong key was let in');

    const before = {
      appointments: await prisma.appointment.count(),
      patients: await prisma.patient.count(),
      audit: await prisma.auditLog.count(),
      timeOff: await prisma.timeOff.count(),
    };

    // Old-style clients open with initialize; the server must answer it.
    const init = await rpc(key, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.status, 200, `initialize failed: ${JSON.stringify(init.body)}`);

    const list = await rpc(key, 'tools/list');
    const names = list.body.result.tools.map((t: { name: string }) => t.name).sort();
    assert.deepEqual(names, ['centre', 'day', 'residents', 'therapists'], 'the read tools changed');
    for (const t of list.body.result.tools) assert.equal(t.annotations?.readOnlyHint, true, `${t.name} is not marked read-only`);
    const size = Buffer.byteLength(JSON.stringify(list.body.result.tools));
    assert.ok(size <= TOOL_LIST_BUDGET_BYTES, `the tool list is ${size} bytes, over its ${TOOL_LIST_BUDGET_BYTES} budget`);

    const call = async (name: string, args: Record<string, unknown>) => {
      const r = await rpc(key, 'tools/call', { name, arguments: args });
      assert.equal(r.status, 200);
      assert.ok(!r.body.error && !r.body.result.isError, `${name} ${JSON.stringify(args)} failed: ${JSON.stringify(r.body)}`);
      return r.body.result;
    };

    const today = (await call('centre', { action: 'today' })).structuredContent;
    assert.match(today.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(today.timezone);

    const read = (await call('day', { action: 'read', date: DAY })).structuredContent;
    const mine = read.residents.find((r: { resident_id: string }) => r.resident_id === resident.id);
    assert.ok(mine, 'the resident is not on the day');
    assert.equal(mine.stay_day, 'Day 5 of 14');
    const ten = mine.treatments.find((t: { treatment_id: string }) => t.treatment_id === treatment.id);
    assert.equal(ten.team.lead.name, meera.name);
    assert.deepEqual(ten.team.others.map((o: { name: string }) => o.name), [asha.name], 'the co-therapist is missing');
    assert.ok(read.therapists_off.some((t: { name: string; reason: string }) => t.name === ravi.name && t.reason === 'Sick leave'));

    const check = await call('day', { action: 'check', date: DAY });
    assert.ok(check.structuredContent.problems.some((p: { kind: string; who: string }) => p.kind === 'STAFF_OFF'), 'check missed a therapist booked on leave');
    assert.ok(check.content[0].text.length > 0, 'check gave nothing to say');

    const sheet = await call('day', { action: 'sheet', date: DAY });
    const pdf = sheet.content.find((c: { type: string }) => c.type === 'resource');
    assert.equal(pdf.resource.mimeType, 'application/pdf');
    assert.equal(Buffer.from(pdf.resource.blob, 'base64').subarray(0, 4).toString(), '%PDF');

    const rota = await call('day', { action: 'rota', date: DAY, therapist_id: meera.id });
    assert.ok(rota.content.some((c: { type: string }) => c.type === 'resource'));

    const found = (await call('residents', { action: 'find', name: `${TAG} Res` })).structuredContent;
    assert.equal(found.residents.length, 1);
    const got = (await call('residents', { action: 'get', resident_id: resident.id, date: DAY })).structuredContent;
    assert.equal(got.stay.start, '2030-05-10');
    assert.equal(got.treatments.length, 2);
    const house = (await call('residents', { action: 'in_house', date: DAY })).structuredContent;
    assert.ok(house.staying.some((r: { resident_id: string }) => r.resident_id === resident.id));

    const free = (await call('therapists', { action: 'free', date: DAY, therapy_id: pair.id })).structuredContent;
    const byName = new Map(free.therapists.map((t: { name: string }) => [t.name, t]));
    assert.equal(byName.size, 3, 'therapists trained in the therapy were missed or others let in');
    const meeraFree = byName.get(meera.name) as { free: { from: string; to: string }[]; busy: { from: string }[] };
    assert.ok(meeraFree.busy.some((b) => b.from === '10:00'));
    assert.ok(!meeraFree.free.some((f) => f.from <= '10:00' && f.to > '10:00'), 'Meera shows free while treating');
    assert.equal((byName.get(ravi.name) as { free: unknown[] }).free.length, 0, 'a therapist on leave shows free time');
    const listed = (await call('therapists', { action: 'list' })).structuredContent;
    assert.ok(listed.therapists.some((t: { name: string; trained_in: string[] }) => t.name === meera.name && t.trained_in.includes(pair.name)));

    const after = {
      appointments: await prisma.appointment.count(),
      patients: await prisma.patient.count(),
      audit: await prisma.auditLog.count(),
      timeOff: await prisma.timeOff.count(),
    };
    assert.deepEqual(after, before, 'reading through the assistant changed the database');

    // Disconnecting in Settings shuts the door at once.
    const revoke = await fetch(`${API_BASE}/mcp-key`, { method: 'DELETE', headers: admin });
    assert.equal(revoke.status, 200);
    assert.equal((await rpc(key, 'tools/list')).status, 401, 'a revoked key still works');

    console.log('Assistant: only the current key gets in, four read tools answer from the day as it is, and reading writes nothing.');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
