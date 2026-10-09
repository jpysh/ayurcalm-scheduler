/**
 * Private links (#219): a therapist, doctor or resident sees and records on
 * their own treatments only, with no sign-in, and a reissued link stops the old
 * one. Builds its own day in 2030 and removes it. Needs a running server.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const DAY = '2030-03-13';
const tag = `L${Date.now()}`;

const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const admin = { Authorization: `Bearer ${login.token}` };
const call = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}${path}`, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const issue = async (kind: 'staff' | 'patients', id: string) => (await (await call(`/${kind}/${id}/link?renew=1`, {}, admin)).json()).token as string;
const shared = async (kind: 'staff' | 'patients', id: string) => (await (await call(`/${kind}/${id}/link`, {}, admin)).json()).token as string;

const therapy = await prisma.therapy.create({ data: { name: `Abhyanga ${tag}`, required_amenities: [], duration_minutes: 60, checklist: [{ text: 'Oil warmed', required: true }], vitals: ['bp', 'pulse'] } });
const consult = await prisma.therapy.create({ data: { name: `Consultation ${tag}`, required_amenities: [], duration_minutes: 20, is_consultation: true } });
const therapist = await prisma.staff.create({ data: { name: `Asha ${tag}`, gender: 'female', specializations: [therapy.id], weekly_schedule: {} } });
const other = await prisma.staff.create({ data: { name: `Meera ${tag}`, gender: 'female', phone: '98765 43210', specializations: [therapy.id], weekly_schedule: {} } });
const doctor = await prisma.staff.create({ data: { name: `Dr ${tag}`, gender: 'female', role: 'doctor', specializations: [consult.id], weekly_schedule: {} } });
const patient = await prisma.patient.create({ data: { name: `Rekha ${tag}`, gender: 'female' } });
const guest = await prisma.patient.create({ data: { name: `Sita ${tag}`, gender: 'female' } });
const extra: string[] = [];
const stays: string[] = [];
const leavers: string[] = [];
const book = (therapy_id: string, staff_id: string, start_time: string) => prisma.appointment.create({ data: {
  patient_id: patient.id, therapy_id, staff_id, scheduled_date: new Date(DAY), start_time,
  duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'confirmed', assignment_type: 'manual',
} });
const mineA = await book(therapy.id, therapist.id, '10:00');
const theirs = await book(therapy.id, other.id, '12:00');
const visit = await book(consult.id, doctor.id, '09:00');

try {
  assert.equal((await call('/public/link/not-a-real-token-at-all-xyz')).status, 404, 'an unknown link is refused, without a sign-in prompt');
  assert.equal((await call(`/staff/${therapist.id}/link`, {})).status, 401, 'issuing a link needs the admin');

  // The phone comes back with the link, so the screen can offer Send on WhatsApp to them (#413).
  { const rr = await call(`/staff/${other.id}/link`, {}, admin); const jj = await rr.json(); assert.equal(jj.phone, "98765 43210", JSON.stringify([rr.status, jj])); }

  const t = await issue('staff', therapist.id);
  const day = await (await call(`/public/link/${t}?date=${DAY}`)).json();
  assert.equal(day.who.kind, 'therapist');
  assert.deepEqual(day.items.map((i: { id: string }) => i.id), [mineA.id], 'a therapist sees their own treatments only');
  assert.deepEqual(day.items[0].checklist, [{ text: 'Oil warmed', required: true, done: false }]);
  // A day off says so rather than "Nothing booked" (#424).
  await prisma.timeOff.create({ data: { entity_type: 'staff', entity_id: therapist.id, date: new Date('2030-03-14'), description: 'Family wedding' } });
  assert.equal((await (await call(`/public/link/${t}?date=2030-03-14`)).json()).off, 'Family wedding', 'the link does not say the day is off');

  assert.equal((await call(`/public/link/${t}/appointments/${mineA.id}`, { checklist: { 'Oil warmed': true, 'Invented': true }, vitals: { bp: '130/85', weight: '70' }, room_ready: true })).status, 200);
  const rec = (await prisma.appointment.findUnique({ where: { id: mineA.id } }))!.record as Record<string, any>;
  assert.deepEqual(rec.checklist, { 'Oil warmed': true }, 'only the therapy\'s own checklist is kept');
  assert.deepEqual(rec.vitals, { bp: '130/85' }, 'only the therapy\'s own vitals are kept');
  assert.equal(rec.room_ready, true);
  // Done (#522): the centre's clock when it was ticked, gone when unticked, never from a patient.
  assert.equal((await call(`/public/link/${t}/appointments/${mineA.id}`, { done: true })).status, 200);
  const doneAt = ((await prisma.appointment.findUnique({ where: { id: mineA.id } }))!.record as Record<string, any>).done;
  assert.match(doneAt, /^\d\d:\d\d$/, 'done keeps the time');
  assert.equal((await (await call(`/public/link/${t}?date=${DAY}`)).json()).items.find((i: { id: string }) => i.id === mineA.id).done, doneAt, 'and the link reads it back');
  assert.equal((await call(`/public/link/${t}/appointments/${mineA.id}`, { done: false })).status, 200);
  assert.equal(((await prisma.appointment.findUnique({ where: { id: mineA.id } }))!.record as Record<string, any>).done, undefined, 'unticking clears it');
  assert.equal((await call(`/public/link/${t}/appointments/${theirs.id}`, { room_ready: true })).status, 404, 'not someone else\'s treatment');
  assert.equal((await call(`/public/link/${t}/appointments/${mineA.id}`, { note: 'x' })).status, 403, 'only a doctor writes the note');
  assert.equal((await call(`/public/link/${t}/issues`, { kind: 'room', appointment_id: mineA.id, note: 'Steam not working' })).status, 201);
  assert.equal((await call(`/public/link/${t}/issues`, { kind: 'sos', appointment_id: mineA.id })).status, 201);

  const d = await issue('staff', doctor.id);
  assert.equal((await call(`/public/link/${d}/appointments/${visit.id}`, { note: 'Continue for a week' })).status, 200);
  assert.equal((await prisma.appointment.findUnique({ where: { id: visit.id } }))!.notes, 'Continue for a week', 'the doctor\'s note is the consultation\'s note');

  const p = await issue('patients', patient.id);
  const own = await (await call(`/public/link/${p}?date=${DAY}`)).json();
  assert.equal(own.items.length, 3, 'a resident sees their whole day');
  assert.match(own.now, /^\d\d:\d\d$/, 'the page is told the centre\'s time (#529)');
  assert.equal(own.items[0].checklist, undefined, 'and nothing the staff record');
  assert.equal((await call(`/public/link/${p}/appointments/${mineA.id}`, { feedback: 'down', feedback_note: 'Too hot' })).status, 200);
  assert.ok((await call(`/public/link/${p}/appointments/${mineA.id}`, { room_ready: true })).status >= 400, 'a resident cannot record for staff');
  assert.equal((await call(`/public/link/${p}/issues`, { kind: 'sos' })).status, 403);
  // Their own details before arriving (#489): read and saved on their link; never from a staff link, never an unknown field.
  assert.equal(own.details.country, null);
  const putDetails = (tok: string, body: unknown) => fetch(`${API}/public/link/${tok}/details`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await putDetails(p, { country: 'Germany', id_number: 'C01X00T47', date_of_birth: '1980-02-01' })).status, 200);
  const saved = await prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
  assert.deepEqual([saved.country, saved.id_number, saved.date_of_birth?.toISOString().slice(0, 10)], ['Germany', 'C01X00T47', '1980-02-01']);
  // The Log says a guest filled their details in, by whom and which fields, never the values (#499).
  const entry = ((await (await call('/log', undefined, admin)).json()).entries as { text: string; who: string }[]).find((e) => /filled in their own details/.test(e.text));
  assert.ok(entry && entry.who === 'the guest' && /country/.test(entry.text) && !/Germany|C01X00T47/.test(entry.text), `the Log: ${JSON.stringify(entry)}`);
  // A foreign guest's visa goes to the card, where Form C reads it (#576).
  assert.equal((await putDetails(p, { visa_number: 'V123456', visa_valid_until: '2030-03-01' })).status, 200);
  const visa = await prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
  assert.deepEqual([visa.visa_number, visa.visa_valid_until], ['V123456', '2030-03-01']);
  assert.equal((await putDetails(p, { visa_valid_until: '01/03/2030' })).status >= 400, true, 'a visa date must be yyyy-mm-dd');
  assert.equal((await putDetails(t, { country: 'X' })).status, 403, 'a therapist link cannot write a patient');
  assert.ok((await putDetails(p, { name: 'Someone else' })).status >= 400, 'a link cannot change the name');

  // The admin reads both on the day, as notes: the room issue and the 👎.
  const check = await (await call(`/day-check?date=${DAY}`, undefined, admin)).json();
  const kinds = check.problems.filter((p: { problem_class: string }) => p.problem_class === 'worth_knowing').map((p: { id: string; what: string }) => `${p.id.split(':')[0]} ${p.what}`);
  assert.ok(kinds.includes('ISSUE Room not usable: Steam not working'), `the issue is on the day: ${kinds}`);
  assert.ok(kinds.includes('FEEDBACK 👎 Too hot'), 'and the 👎 with its note');
  // An SOS is a note that counts (#521): the pill and the Day section read `urgent`, a room issue does not.
  const flagged = check.problems.filter((p: { urgent?: boolean }) => p.urgent).map((p: { what: string }) => p.what);
  assert.deepEqual(flagged, ['SOS: needs help now'], 'only the SOS is urgent');

  assert.equal(await shared('staff', therapist.id), t, 'sharing again sends the same link');
  const t2 = await issue('staff', therapist.id);
  assert.equal((await call(`/public/link/${t}?date=${DAY}`)).status, 404, 'a reissued link stops the old one');
  assert.equal((await call(`/public/link/${t2}?date=${DAY}`)).status, 200);
  // The round (#423): a patient in house with no review in the last week is due;
  // the plan written from the link is theirs. Built around the centre's today,
  // whatever day that is, so it never depends on the clock.
  const today = own.today as string;
  const dayMs = 86400000;
  const iso = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * dayMs);
  const stay = await prisma.patientStay.create({ data: { patient_id: guest.id, start_date: iso(-10), end_date: iso(10), duration_days: 21 } });
  const seen = await prisma.appointment.create({ data: { patient_id: guest.id, therapy_id: consult.id, staff_id: doctor.id, scheduled_date: iso(-9), start_time: '09:00', duration_minutes: 20, session_number: 1, total_sessions: 1, status: 'completed', assignment_type: 'manual', notes: 'Start Abhyanga daily' } });
  extra.push(seen.id); stays.push(stay.id);
  // Their own details are asked while a stay is here or coming, not on the leaving day or after (#549).
  const left = await prisma.patient.create({ data: { name: `Gone ${tag}`, gender: 'male' } }); leavers.push(left.id);
  const leftStay = await prisma.patientStay.create({ data: { patient_id: left.id, start_date: iso(-5), end_date: iso(0), duration_days: 6 } }); stays.push(leftStay.id);
  const leftTok = await issue('patients', left.id);
  assert.equal((await (await call(`/public/link/${leftTok}`)).json()).details, undefined, 'nothing is asked on the leaving day');
  assert.ok((await (await call(`/public/link/${p}`)).json()).details, 'still asked while a stay is ahead');
  const round = await (await call(`/public/link/${d}/round`)).json();
  const row = round.find((r: { patient_id: string }) => r.patient_id === guest.id);
  assert.ok(row, 'a patient with no review in the last week is on the round');
  // What the doctor decides the week from (#530): the last readings, the week's treatments by therapy, the diet.
  assert.deepEqual(row.facts, { readings: [], treatments: '', diet: null }, 'nothing yet: the fields are there and empty');
  const weekAgo = await prisma.appointment.create({ data: { patient_id: guest.id, therapy_id: therapy.id, staff_id: therapist.id, scheduled_date: iso(-2), start_time: '10:00', duration_minutes: 60, session_number: 1, total_sessions: 1, status: 'completed', assignment_type: 'manual', record: { vitals: { bp: '124/82' } } } });
  extra.push(weekAgo.id);
  const again = (await (await call(`/public/link/${d}/round`)).json()).find((r: { patient_id: string }) => r.patient_id === guest.id);
  assert.equal(again.facts.treatments, therapy.name, 'one treatment this week');
  assert.match(again.facts.readings[0], /^BP 124\/82 · \d{4}-\d\d-\d\d$/, 'the reading the therapist recorded');
  assert.equal(row.day, 11); assert.equal(row.booked, null); assert.equal(row.last.note, 'Start Abhyanga daily');
  const put = (token: string, id: string) => fetch(`${API}/public/link/${token}/round/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'Shirodhara alternate days' }) });
  assert.equal((await put(d, guest.id)).status, 200);
  assert.equal((await prisma.patient.findUnique({ where: { id: guest.id } }))!.doctor_plan, 'Shirodhara alternate days', 'the plan is the patient\'s, as the card reads it');
  assert.equal((await put(t2, guest.id)).status, 403, 'only a doctor writes the plan');
  assert.equal((await put(d, patient.id)).status, 404, 'only for a patient in house');
  assert.equal((await call(`/public/link/${t2}/round`)).status, 403, 'only a doctor sees the round');
  // A guest not here yet opens on their first day and is told when it is (#498).
  const later = await prisma.patientStay.create({ data: { patient_id: patient.id, start_date: iso(5), end_date: iso(9), duration_days: 5 } });
  stays.push(later.id);
  const first = iso(5).toISOString().slice(0, 10);
  const opened = await (await call(`/public/link/${p}`)).json();
  assert.deepEqual([opened.date, opened.arrives], [first, first], 'opens on the first day of the stay they are waiting for');
  assert.equal((await (await call(`/public/link/${p}?date=${today}`)).json()).date, today, 'a day they ask for is still that day');
  assert.equal((await (await call(`/public/link/${t2}`)).json()).arrives, null, 'staff are not told about stays');
  // After closing the link opens on tomorrow (#662); a closing time of 00:00 is always past, whatever the hour of the run.
  const closing = (await prisma.settings.findUnique({ where: { id: 'singleton' } }))!.closing_time;
  await prisma.settings.update({ where: { id: 'singleton' }, data: { closing_time: '00:00' } });
  try {
    assert.equal((await (await call(`/public/link/${t2}`)).json()).date, iso(1).toISOString().slice(0, 10), 'after closing a therapist\'s link opens on tomorrow');
  } finally { await prisma.settings.update({ where: { id: 'singleton' }, data: { closing_time: closing } }); }
  // One question on the leaving day (#509): asked once, kept on the stay, read by the admin as information.
  const leaver = await prisma.patient.create({ data: { name: `${tag} Leaver`, gender: 'female' } });
  leavers.push(leaver.id);
  stays.push((await prisma.patientStay.create({ data: { patient_id: leaver.id, start_date: iso(-3), end_date: iso(0), duration_days: 4 } })).id);
  const lt = await issue('patients', leaver.id);
  assert.equal((await (await call(`/public/link/${lt}`)).json()).feedback.given, null, 'asked on the leaving day');
  assert.equal((await (await call(`/public/link/${p}?date=${today}`)).json()).feedback, null, 'not asked of a guest who has not left');
  const answer = (tok: string, body: unknown) => fetch(`${API}/public/link/${tok}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await answer(lt, { rating: 'wonderful' })).status, 400, 'three answers only');
  assert.equal((await answer(t2, { rating: 'good' })).status, 403, 'staff do not answer');
  assert.equal((await answer(lt, { rating: 'fine', note: 'Lovely food' })).status, 200);
  const given = (await (await call(`/public/link/${lt}`)).json()).feedback.given;
  assert.deepEqual([given.rating, given.note], ['fine', 'Lovely food'], 'kept, and the link then says thank you');
  const info = ((await (await call(`/attention?date=${today}`, undefined, admin)).json()).items as { who: string; rule: string; kind: string; what: string }[]).find((i) => i.who === leaver.name && i.rule === 'feedback');
  assert.ok(info && info.kind === 'information' && /Stay was fine: “Lovely food”/.test(info.what), `What needs you says it: ${JSON.stringify(info)}`);
  console.log('links: ok');
} finally {
  await prisma.timeOff.deleteMany({ where: { entity_type: 'staff', entity_id: therapist.id } });
  await prisma.linkIssue.deleteMany({ where: { staff_id: { in: [therapist.id, doctor.id] } } });
  await prisma.appointment.deleteMany({ where: { id: { in: [mineA.id, theirs.id, visit.id, ...extra] } } });
  await prisma.patientStay.deleteMany({ where: { id: { in: stays } } });
  await prisma.auditLog.deleteMany({ where: { admin_id: 'guest', entity_id: patient.id } });
  await prisma.patient.deleteMany({ where: { id: { in: [patient.id, guest.id, ...leavers] } } });
  await prisma.staff.deleteMany({ where: { id: { in: [therapist.id, other.id, doctor.id] } } });
  await prisma.therapy.deleteMany({ where: { id: { in: [therapy.id, consult.id] } } });
  await prisma.$disconnect();
}
