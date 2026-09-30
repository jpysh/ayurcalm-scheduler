/**
 * The assistant plans a day and changes nothing until the admin says yes (#120).
 *
 * On its own day in 2030, with a therapist off and two treatments still on their name:
 *
 *   - plan/propose_day is the plan POST /day-check gives the screen, move for move
 *   - apply writes it as one batch, the same yes twice is the same batch, and
 *     history/undo puts the day back exactly
 *   - a plan whose slot was booked in the app meanwhile is stale and writes nothing
 *   - a plan over half an hour old is refused
 *   - propose_move says why a move is refused and the nearest free time
 *
 * Needs a running server and its database: API_BASE and DATABASE_URL.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const TAG = 'Mcpplan';
const DAY = '2030-05-15';
const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const MCP = API_BASE.replace(/\/api$/, '/mcp');
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'demo1234';
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
  await prisma.auditLog.deleteMany({ where: { action: 'mcp_proposal', entity_id: DAY } });
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
    const admin = { Authorization: `Bearer ${(await login.json()).token}`, 'Content-Type': 'application/json' };

    // The day: Ravi is off with two treatments still on his name; Asha and Meera are in.
    const day = new Date(`${DAY}T00:00:00.000Z`);
    const therapy = await prisma.therapy.create({ data: { name: `${TAG} Abhyanga`, required_amenities: [], duration_minutes: 60 } });
    const room = (n: string) => prisma.therapyRoom.create({ data: { name: `${TAG} Room ${n}`, amenities: [], weekly_schedule: allDay } });
    const [roomA, roomB] = [await room('A'), await room('B')];
    const staff = (name: string) => prisma.staff.create({ data: { name: `${TAG} ${name}`, gender: 'female', specializations: [therapy.id], weekly_schedule: allDay } });
    const [ravi] = [await staff('Ravi'), await staff('Asha'), await staff('Meera')];
    const resident = async (name: string) => {
      const p = await prisma.patient.create({ data: { name: `${TAG} ${name}`, gender: 'female' } });
      await prisma.patientStay.create({ data: { patient_id: p.id, start_date: new Date('2030-05-10T00:00:00.000Z'), end_date: new Date('2030-05-24T00:00:00.000Z'), duration_days: 14 } });
      return p;
    };
    const [one, two, three] = [await resident('One'), await resident('Two'), await resident('Three')];
    for (const [p, start_time] of [[one, '10:00'], [two, '11:00']] as const) {
      await prisma.appointment.create({ data: {
        patient_id: p.id, therapy_id: therapy.id, staff_id: ravi.id, room_id: roomA.id, scheduled_date: day, start_time,
        duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual',
      } });
    }
    await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: ravi.id, date: day, description: 'Sick leave' } });

    const download = await fetch(`${API_BASE}/mcp-key/extension`, { method: 'POST', headers: admin });
    assert.equal(download.status, 200, 'the Settings download failed');
    const key: string = JSON.parse(fileInZip(Buffer.from(await download.arrayBuffer()), 'manifest.json')).server.mcp_config.env.AYURCALM_KEY;
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = await rpc(key, 'tools/call', { name, arguments: args });
      assert.ok(r.status === 200 && !r.body.error, `${name} ${JSON.stringify(args)} failed: ${JSON.stringify(r.body)}`);
      return r.body.result as { isError?: boolean; content: { text: string }[]; structuredContent: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    const snapshot = async () => (await prisma.appointment.findMany({ where: { patient_id: { in: [one.id, two.id, three.id] } }, orderBy: { id: 'asc' } }))
      .map((a) => [a.id, a.staff_id, a.co_staff_ids.join(), a.room_id, a.start_time, a.scheduled_date.toISOString(), a.status].join('|'));
    const batches = () => prisma.auditLog.count({ where: { action: { in: ['dayfix', 'replan'] } } });

    // The assistant's plan is the screen's plan.
    const screen = await (await fetch(`${API_BASE}/day-check`, { method: 'POST', headers: admin, body: JSON.stringify({ date: DAY }) })).json();
    const before = await snapshot();
    const wrote = await batches();
    const first = (await call('plan', { action: 'propose_day', date: DAY })).structuredContent;
    type Shown = { treatment_id: string; to: { date: string; start_time: string; team: { lead: { id: string } | null; others: { id: string }[] }; room: { id: string } | null } };
    const flat = (m: Shown) => [m.treatment_id, m.to.date, m.to.start_time, m.to.team.lead?.id ?? null, m.to.team.others.map((o) => o.id).join(), m.to.room?.id ?? null].join('|');
    assert.deepEqual(
      (first.moves as Shown[]).map(flat).sort(),
      (screen.plan as { appointment_id: string; date: string; start_time: string; staff_id: string | null; co_staff_ids: string[]; room_id: string | null }[])
        .map((f) => [f.appointment_id, f.date, f.start_time, f.staff_id, f.co_staff_ids.join(), f.room_id].join('|')).sort(),
      'the assistant proposed a different plan from the one Verify shows',
    );
    assert.equal(first.moves.length, 2, `expected both of Ravi's treatments to move, got ${first.moves.length}`);
    assert.deepEqual(
      (first.not_placed as { reason: string }[]).map((n) => n.reason).sort(),
      (screen.problems as { appointment_id: string | null; fix: unknown; no_fix_reason: string | null }[]).filter((p) => p.appointment_id && !p.fix && p.no_fix_reason).map((p) => p.no_fix_reason).sort(),
      'the not-placed reasons differ from Verify',
    );
    assert.deepEqual(await snapshot(), before, 'proposing changed the day');

    // Yes: one batch. Yes again: the same batch. Undo: the day exactly as before.
    const applied = (await call('plan', { action: 'apply', proposal_id: first.proposal_id })).structuredContent;
    assert.equal(applied.applied, 2);
    assert.notDeepEqual(await snapshot(), before, 'applying changed nothing');
    assert.equal((await call('plan', { action: 'apply', proposal_id: first.proposal_id })).structuredContent.batch_id, applied.batch_id, 'the same yes twice made a second batch');
    assert.equal(await batches(), wrote + 1);
    assert.equal((await call('history', { action: 'undo', batch_id: applied.batch_id })).structuredContent.undone, true);
    assert.deepEqual(await snapshot(), before, 'undo did not put the day back exactly');
    assert.equal((await call('history', { action: 'undo', batch_id: applied.batch_id })).isError, true, 'the same batch was undone twice');

    // Stale: the therapist a move goes to is booked in the app, in the other room, before the yes.
    const second = (await call('plan', { action: 'propose_day', date: DAY })).structuredContent;
    const slot = (second.moves as Shown[])[0].to;
    const booked = await fetch(`${API_BASE}/appointments/one`, { method: 'POST', headers: admin, body: JSON.stringify({ patient_id: three.id, therapy_id: therapy.id, date: DAY, start_time: slot.start_time, staff_id: slot.team.lead!.id, room_id: roomB.id }) });
    assert.equal(booked.status, 201, `could not book the plan's slot in the app: ${await booked.clone().text()}`);
    const held = await snapshot();
    const stale = await call('plan', { action: 'apply', proposal_id: second.proposal_id });
    assert.equal(stale.structuredContent.stale, true, `a plan over a changed day was applied: ${stale.content[0].text}`);
    assert.match(stale.content[0].text, /the day has changed since.*I haven't changed anything/);
    assert.deepEqual(await snapshot(), held, 'a stale plan wrote something');
    // The undone batch is no longer counted, so any batch here is the stale plan's.
    assert.equal(await batches(), wrote, 'a stale plan left a batch');

    // Expired: over half an hour old.
    const third = (await call('plan', { action: 'propose_day', date: DAY })).structuredContent;
    await prisma.auditLog.update({ where: { id: third.proposal_id }, data: { timestamp: new Date(Date.now() - 31 * 60000) } });
    const expired = await call('plan', { action: 'apply', proposal_id: third.proposal_id });
    assert.equal(expired.structuredContent.expired, true, 'an expired plan was applied');
    assert.deepEqual(await snapshot(), held, 'an expired plan wrote something');

    // One move: refused with the rule and the nearest free time; without a place, alternatives.
    const mine = (await prisma.appointment.findFirstOrThrow({ where: { patient_id: one.id } })).id;
    const refused = (await call('plan', { action: 'propose_move', treatment_id: mine, to: { start_time: slot.start_time, therapist_id: slot.team.lead!.id, room_id: slot.room!.id } })).structuredContent;
    assert.ok(refused.refused?.rule && refused.refused.message, `a move onto a taken slot was not refused: ${JSON.stringify(refused)}`);
    assert.match(String(refused.nearest_free_time), /^\d\d:\d\d$/);
    const others = (await call('plan', { action: 'propose_move', treatment_id: mine })).structuredContent;
    assert.ok(others.alternatives.length > 0, 'no alternative was offered for a treatment with two therapists free');

    // A therapist not yet marked off: their day is planned away from them.
    const away = (await call('plan', { action: 'propose_day', date: DAY, absent_therapist_id: slot.team.lead!.id })).structuredContent;
    assert.ok(away.moves.length > 0 && (away.moves as Shown[]).every((m) => m.to.team.lead?.id !== slot.team.lead!.id), 'the absent therapist was given their own treatment');
    assert.deepEqual(await snapshot(), held, 'proposing changed the day');

    await fetch(`${API_BASE}/mcp-key`, { method: 'DELETE', headers: admin });
    console.log("Assistant's plan: the same plan Verify shows, written only on a yes, once, undone exactly; stale and expired plans write nothing; a refused move says why.");
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
