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
  await prisma.appointment.deleteMany({ where: { patient_id: { in: patients } } });
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
    type Out = { rules: { id: string; on: boolean; hours?: number; count: number }[]; items: { rule: string; who: string; what: string }[] };
    const read = (): Promise<Out> => call('GET', `/attention?date=${DAY}`);
    const rule = (o: Out, id: string) => o.rules.find((r) => r.id === id)!;

    // Aarav leaves today after three days with nothing written; Bela leaves tomorrow.
    const aarav = await prisma.patient.create({ data: { name: `${TAG} Aarav`, gender: 'male' } });
    const bela = await prisma.patient.create({ data: { name: `${TAG} Bela`, gender: 'female' } });
    await prisma.patientStay.create({ data: { patient_id: aarav.id, start_date: at('2030-08-18'), end_date: at(DAY), duration_days: 3 } });
    await prisma.patientStay.create({ data: { patient_id: bela.id, start_date: at('2030-08-19'), end_date: at('2030-08-21'), duration_days: 3 } });

    // The day check is read for tomorrow after closing, so its words name no day (#712).
    const idle = (await call('GET', `/day-check?date=${DAY}`)).problems.filter((p: { kind: string; who: string }) => p.kind === 'IDLE_RESIDENT' && p.who.startsWith(TAG));
    assert.ok(idle.length && idle.every((p: { what: string }) => !/today/.test(p.what)), 'nothing booked says no "today"');

    let o = await read();
    const mine = (r: string) => o.items.filter((i) => i.rule === r && i.who.startsWith(TAG)).map((i) => i.who);
    assert.deepEqual(mine('leaves_today'), [`${TAG} Aarav`]);
    // Off by default (#983); its count still says Bela, past 24 hours with no notes. Aarav leaves today, past needing them.
    assert.deepEqual(mine('arrival_open'), [], 'arrival notes are off by default');
    assert.ok(rule(o, 'arrival_open').count >= 1);
    // A leaving-day item is grey before midday and counts from it (#983); an asked day reads at midday.
    assert.deepEqual(o.items.filter((i) => i.rule === 'leaves_today' && i.who === `${TAG} Aarav`).map((i) => (i as { kind?: string }).kind), ['action']);
    assert.equal(rule(o, 'leaves_tomorrow').count >= 1, true, 'the count says what the rule would raise');
    assert.deepEqual(mine('leaves_tomorrow'), [], 'off by default, so it raises nothing');
    assert.equal(rule(o, 'vitals').count, 0, 'vitals wait for data');

    // One plan for everyone the rule names (#942): both guests get it, the rule clears, Undo puts it back, nobody outside the rule is touched.
    assert.deepEqual(mine('no_diet').sort(), [`${TAG} Aarav`, `${TAG} Bela`]);
    const plan = (await call('GET', '/diet-templates'))[0];
    const set = await call('POST', '/attention/diet', { date: DAY, template_id: plan.id });
    assert.equal(set.count, 2);
    o = await read();
    assert.deepEqual(mine('no_diet'), [], 'every named guest now has a plan');
    await call('POST', '/attention/diet/undo', { segment_ids: set.segment_ids });
    o = await read();
    assert.equal(mine('no_diet').length, 2, 'Undo puts the day back as it was');
    assert.equal((await send('POST', '/attention/diet', { date: DAY, template_id: '00000000-0000-4000-8000-000000000000' })).status, 400);

    // Form C (#415): a guest from Germany who arrives today is due tomorrow; one with no country is not asked; filed, it goes.
    const clara = await prisma.patient.create({ data: { name: `${TAG} Clara`, gender: 'female', country: 'Germany' } });
    const claraStay = await prisma.patientStay.create({ data: { patient_id: clara.id, start_date: at(DAY), end_date: at('2030-08-25'), duration_days: 6 } });
    o = await read();
    assert.deepEqual(o.items.filter((i) => i.rule === 'form_c' && i.who.startsWith(TAG)).map((i) => [i.who, i.what]), [[`${TAG} Clara`, 'Form C due by Wed 21 Aug']]);
    await call('PATCH', `/patients/${clara.id}/stays/${claraStay.id}/form-c`, { filed: true });
    o = await read();
    assert.deepEqual(mine('form_c'), [], 'filed, it is no longer raised');
    // Filed at 01:30 in India on the 21st is the 21st, not the UTC 20th (#448).
    await prisma.patientStay.update({ where: { id: claraStay.id }, data: { form_c_filed: new Date('2030-08-20T20:00:00.000Z') } });
    assert.equal((await call('GET', `/patients/${clara.id}/day?date=${DAY}`)).form_c.filed, '2030-08-21');
    // A guest from France who left yesterday without it filed is still asked (#448).
    const dora = await prisma.patient.create({ data: { name: `${TAG} Dora`, gender: 'female', country: 'France' } });
    await prisma.patientStay.create({ data: { patient_id: dora.id, start_date: at('2030-08-15'), end_date: at('2030-08-19'), duration_days: 5 } });
    o = await read();
    assert.deepEqual(o.items.filter((i) => i.rule === 'form_c' && i.who.startsWith(TAG)).map((i) => [i.who, i.what]), [[`${TAG} Dora`, 'Form C overdue since Fri 16 Aug']]);
    // A day visitor who came and went yesterday is due today, not overdue (#664).
    const ines = await prisma.patient.create({ data: { name: `${TAG} Ines`, gender: 'female', country: 'Spain' } });
    await prisma.patientStay.create({ data: { patient_id: ines.id, start_date: at('2030-08-19'), end_date: at('2030-08-19'), duration_days: 1 } });
    o = await read();
    assert.deepEqual(o.items.filter((i) => i.rule === 'form_c' && i.who === `${TAG} Ines`).map((i) => i.what), ['Form C due by Tue 20 Aug']);
    // A foreign outpatient who sleeps elsewhere has no accommodation to report (#719).
    const juno = await prisma.patient.create({ data: { name: `${TAG} Juno`, gender: 'female', country: 'Germany' } });
    await prisma.patientStay.create({ data: { patient_id: juno.id, start_date: at(DAY), end_date: at(DAY), duration_days: 1, on_site: false } });
    o = await read();
    assert.deepEqual(o.items.filter((i) => i.rule === 'form_c' && i.who === `${TAG} Juno`), [], 'a day patient owes no Form C');
    assert.ok(!(await call('GET', `/patients/${juno.id}/day?date=${DAY}`)).form_c, 'and her card has no Form C row');
    assert.deepEqual(mine('leaves_today').filter((w) => w === `${TAG} Juno`), [], 'a one-day visit owes no discharge summary (#837)');

    // Follow-up (#487): the discharge asked for today, so it is due; marked done, it goes; the card says so.
    const esha = await prisma.patient.create({ data: { name: `${TAG} Esha`, gender: 'female' } });
    const eshaStay = await prisma.patientStay.create({ data: { patient_id: esha.id, start_date: at('2030-07-01'), end_date: at('2030-07-10'), duration_days: 10, discharge: { follow_up_date: DAY } } });
    o = await read();
    assert.deepEqual(o.items.filter((i) => i.rule === 'follow_up' && i.who.startsWith(TAG)).map((i) => [i.who, i.what]), [[`${TAG} Esha`, 'Follow-up due Tue 20 Aug']]);
    assert.deepEqual(o.items.filter((i) => i.rule === 'follow_up' && i.who.startsWith(TAG)).map((i) => (i as { action?: string }).action), ['followup'], 'the row opens the follow-up message itself (#603)');
    assert.equal((await call('GET', `/patients/${esha.id}/day?date=${DAY}`)).follow_up.due, DAY);
    await call('PATCH', `/patients/${esha.id}/stays/${eshaStay.id}/follow-up`, { done: true });
    o = await read();
    assert.deepEqual(mine('follow_up'), [], 'done, it is no longer raised');

    // Next week not planned (#805): reviewed yesterday, nothing in the week after; one treatment there clears it.
    const kiran = await prisma.patient.create({ data: { name: `${TAG} Kiran`, gender: 'male' } });
    await prisma.patientStay.create({ data: { patient_id: kiran.id, start_date: at('2030-08-12'), end_date: at('2030-08-30'), duration_days: 19 } });
    const consult = await prisma.therapy.findFirstOrThrow({ where: { is_consultation: true } });
    const plain = await prisma.therapy.findFirstOrThrow({ where: { is_consultation: false } });
    const appt = (therapy_id: string, date: string, start_time = '09:00') => prisma.appointment.create({ data: { patient_id: kiran.id, therapy_id, scheduled_date: at(date), start_time, duration_minutes: 30, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual' } });
    // A first consultation later today (15:00; an asked day reads at midday) is not a review yet (#966).
    await appt(consult.id, DAY, '15:00');
    o = await read();
    assert.deepEqual(mine('next_week'), [], 'a consultation still ahead is not the review');
    await appt(consult.id, '2030-08-19');
    await appt(plain.id, '2030-08-18');
    o = await read();
    assert.deepEqual(o.items.filter((i) => i.rule === 'next_week' && i.who === `${TAG} Kiran`).map((i) => [i.what, (i as { action?: string }).action]), [['Next week not planned', 'week']], 'the row opens Plan next week');
    assert.deepEqual(mine('next_week'), [`${TAG} Kiran`], 'no review, no line');
    await appt(plain.id, '2030-08-23');
    o = await read();
    assert.deepEqual(mine('next_week'), [], 'one treatment booked in the week clears it');
    // Review due (#981): a 7-night guest seen on arrival is due on day 5, and a consultation booked ahead clears it.
    const lata = await prisma.patient.create({ data: { name: `${TAG} Lata`, gender: 'female' } });
    await prisma.patientStay.create({ data: { patient_id: lata.id, start_date: at('2030-08-16'), end_date: at('2030-08-23'), duration_days: 8 } });
    const seen = (date: string) => prisma.appointment.create({ data: { patient_id: lata.id, therapy_id: consult.id, scheduled_date: at(date), start_time: '09:00', duration_minutes: 30, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual' } });
    await seen('2030-08-16');
    o = await read();
    assert.deepEqual(mine('review_due'), [`${TAG} Lata`], 'day 5 of a 7-night stay is due a review');
    await seen('2030-08-21');
    o = await read();
    assert.deepEqual(mine('review_due'), [], 'a review booked ahead clears it');
    await prisma.appointment.deleteMany({ where: { patient_id: lata.id } });
    await prisma.patientStay.deleteMany({ where: { patient_id: lata.id } });
    await prisma.patient.delete({ where: { id: lata.id } });
    await prisma.appointment.deleteMany({ where: { patient_id: kiran.id } });
    await prisma.patientStay.deleteMany({ where: { patient_id: kiran.id } });
    await prisma.patient.delete({ where: { id: kiran.id } });

    // A later "when": Bela arrived the day before, 36 hours at midday. 36 names her; Aarav, leaving today, is never named (#983).
    await call('PUT', '/attention/rules', { arrival_open: { on: true, hours: 36 }, leaves_tomorrow: { on: true }, no_diet: { on: false }, day: { on: false } });
    o = await read();
    assert.deepEqual(mine('arrival_open'), [`${TAG} Bela`]);
    assert.deepEqual(mine('leaves_tomorrow'), [`${TAG} Bela`]);
    assert.deepEqual(mine('no_diet'), []);
    assert.equal(rule(o, 'no_diet').on, false);
    assert.ok(rule(o, 'no_diet').count >= 2, 'a rule that is off still says what it would raise');
    assert.equal(rule(o, 'day').on, true, 'the locked rule stays on');
    assert.equal(rule(o, 'arrival_open').hours, 36);

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
