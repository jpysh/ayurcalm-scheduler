/**
 * What needs you (#288): the rules and their counts, the patient items the pill
 * lists, a rule switched off or given another "when", a locked rule that stays on,
 * and Reset. Its own day in 2030; the rules go back to the defaults afterwards.
 * Needs a running server: API_BASE.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const TAG = 'Attntest';
const DAY = '2030-08-20';
const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function tidy(prisma: PrismaClient) {
  const patients = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: patients } } });
  await prisma.patient.deleteMany({ where: { id: { in: patients } } });
  await prisma.$executeRaw`UPDATE "Settings" SET attention_rules = NULL`;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await requireDemoData(prisma);
    await tidy(prisma);
    const { token } = await (await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }),
    })).json();
    const send = (method: string, path: string, body?: unknown) =>
      fetch(`${API_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await send(method, path, body);
      assert.ok(res.ok, `${method} ${path}: ${res.status} ${await res.clone().text()}`);
      return res.json();
    };
    type Out = { rules: { id: string; on: boolean; hours?: number; count: number }[]; items: { rule: string; who: string }[] };
    const read = (): Promise<Out> => call('GET', `/attention?date=${DAY}`);
    const rule = (o: Out, id: string) => o.rules.find((r) => r.id === id)!;

    // Aarav leaves today after three days with nothing written; Bela leaves tomorrow.
    const aarav = await prisma.patient.create({ data: { name: `${TAG} Aarav`, gender: 'male' } });
    const bela = await prisma.patient.create({ data: { name: `${TAG} Bela`, gender: 'female' } });
    await prisma.patientStay.create({ data: { patient_id: aarav.id, start_date: at('2030-08-18'), end_date: at(DAY), duration_days: 3 } });
    await prisma.patientStay.create({ data: { patient_id: bela.id, start_date: at('2030-08-19'), end_date: at('2030-08-21'), duration_days: 3 } });

    let o = await read();
    const mine = (r: string) => o.items.filter((i) => i.rule === r && i.who.startsWith(TAG)).map((i) => i.who);
    assert.deepEqual(mine('leaves_today'), [`${TAG} Aarav`]);
    assert.deepEqual(mine('arrival_open').sort(), [`${TAG} Aarav`, `${TAG} Bela`], 'both are past 24 hours with no intake');
    assert.equal(rule(o, 'leaves_tomorrow').count >= 1, true, 'the count says what the rule would raise');
    assert.deepEqual(mine('leaves_tomorrow'), [], 'off by default, so it raises nothing');
    assert.equal(rule(o, 'vitals').count, 0, 'vitals wait for data');

    // A later "when": Bela arrived the day before, 36 hours at midday; Aarav 60. 48 leaves only Aarav.
    await call('PUT', '/attention/rules', { arrival_open: { hours: 48 }, leaves_tomorrow: { on: true }, no_diet: { on: false }, day: { on: false } });
    o = await read();
    assert.deepEqual(mine('arrival_open'), [`${TAG} Aarav`]);
    assert.deepEqual(mine('leaves_tomorrow'), [`${TAG} Bela`]);
    assert.deepEqual(mine('no_diet'), []);
    assert.equal(rule(o, 'no_diet').on, false);
    assert.ok(rule(o, 'no_diet').count >= 2, 'a rule that is off still says what it would raise');
    assert.equal(rule(o, 'day').on, true, 'the locked rule stays on');
    assert.equal(rule(o, 'arrival_open').hours, 48);

    assert.equal((await send('PUT', '/attention/rules', { nonsense: { on: true } })).status, 400);
    assert.equal((await send('PUT', '/attention/rules', { arrival_open: { hours: 0 } })).status, 400);

    // Reset is the empty set.
    await call('PUT', '/attention/rules', {});
    o = await read();
    assert.equal(rule(o, 'arrival_open').hours, 24);
    assert.deepEqual(mine('leaves_tomorrow'), []);
    assert.equal(rule(o, 'no_diet').on, true);

    // A demo reset puts changed rules back too (#389).
    await call('PUT', '/attention/rules', { leaves_tomorrow: { on: true } });
    await call('POST', '/settings/reset-demo-data');
    assert.equal(rule(await read(), 'leaves_tomorrow').on, false, 'reset-demo-data restores the default rules');

    // The setup card remembers what was opened, once each.
    await call('PUT', '/settings/setup-reviewed', { item: 'hours' });
    const r2 = await call('PUT', '/settings/setup-reviewed', { item: 'hours' });
    assert.deepEqual(r2.setup_reviewed.filter((x: string) => x === 'hours'), ['hours']);
    assert.equal((await send('PUT', '/settings/setup-reviewed', { item: 'nope' })).status, 400);
    await prisma.$executeRaw`UPDATE "Settings" SET setup_reviewed = ARRAY[]::text[]`;

    console.log('What needs you: today\'s patient items follow the rules, a "when" and an off switch change them, the locked rule stays on, Reset restores the defaults.');
  } finally {
    await tidy(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
