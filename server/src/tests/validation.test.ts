import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { requireDemoData } from './demoGuard.js';

/**
 * Null fields in a request body must be handled, not crash the server. Both of
 * these payloads once returned a 500: the UI sends `null` for a recurrence that
 * has not been chosen, and a 500 there loses whatever the user typed.
 *
 * Needs a running server and its database: API_BASE and DATABASE_URL.
 */

const prisma = new PrismaClient();
const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'demo1234';

const today = () => new Date().toISOString().slice(0, 10);

async function signIn() {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Sign-in failed with ${res.status}. Is the server seeded?`);
  const { token } = await res.json();
  if (!token) throw new Error('Sign-in returned no token');
  return token as string;
}

async function main() {
  await Promise.race([
    prisma.$connect(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('DB_CONNECT_TIMEOUT')), 3000)),
  ]);
  await requireDemoData(prisma);
  const token = await signIn();
  const post = (path: string, body: unknown) => fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const cases: [string, () => Promise<void>][] = [
    ['deleting a leave that is already gone answers done, not a 500', async () => {
      const res = await fetch(`${API_BASE}/timeoff/00000000-0000-4000-8000-000000000000`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.status !== 204) throw new Error(`answered ${res.status}`);
    }],
    ['a programme event with no recurrence is created, not a 500', async () => {
      const res = await post('/program-events', {
        start_time: '10:00', end_time: '11:00', activity_name: 'Validation Test Event',
        recurrence: null, weekdays: null, notes: null, date: today(),
      });
      if (res.status !== 201) throw new Error(`status ${res.status}: ${await res.text()}`);
      const { id } = await res.json();
      if (id) await prisma.programEvent.delete({ where: { id } });
    }],

    // #732: yesterday's treatments are over; in UTC a morning east of India is still yesterday.
    ['an event on yesterday is not refused by what was done yesterday', async () => {
      const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
      const centreToday = new Intl.DateTimeFormat('en-CA', { timeZone: settings?.timezone || 'Asia/Kolkata' }).format(new Date());
      const yesterday = new Date(Date.parse(`${centreToday}T00:00:00Z`) - 86400000);
      const done = await prisma.appointment.findFirst({ where: { scheduled_date: yesterday, staff_id: { not: null }, status: { notIn: ['cancelled', 'no_show'] } } });
      if (!done) throw new Error('no treatment yesterday in the demo data');
      const res = await post('/program-events', {
        start_time: done.start_time, end_time: '23:00', activity_name: 'Validation Yesterday Event',
        staff_id: done.staff_id, date: yesterday.toISOString().slice(0, 10),
      });
      if (res.status !== 201) throw new Error(`status ${res.status}: ${await res.text()}`);
      const { id } = await res.json();
      if (id) await prisma.programEvent.delete({ where: { id } });
    }],

    ['time off with only a date range is created, not a 500', async () => {
      const res = await post('/timeoff', {
        entity_type: 'center', start_date: today(), end_date: today(),
        description: 'Validation Test TimeOff',
      });
      if (res.status !== 201) throw new Error(`status ${res.status}: ${await res.text()}`);
      const { id } = await res.json();
      if (id) await prisma.timeOff.delete({ where: { id } });
    }],

    ['an unauthenticated write is refused', async () => {
      const res = await fetch(`${API_BASE}/program-events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_name: 'No token', date: today() }),
      });
      if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
    }],

    ['a staff account cannot edit a diet plan, and the plan is unchanged', async () => {
      const email = 'validation-staff@example.com';
      await prisma.user.deleteMany({ where: { email } });
      const made = await post('/users', { email, role: 'staff', password: 'staffpass123' });
      if (made.status !== 201) throw new Error(`creating staff returned ${made.status}: ${await made.text()}`);
      try {
        const login = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: 'staffpass123' }),
        });
        const { token: staffToken } = await login.json();
        const plan = await prisma.dietTemplate.findFirst();
        if (!plan) throw new Error('no diet plan in the demo data');
        const res = await fetch(`${API_BASE}/diet-templates/${plan.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
          body: JSON.stringify({ rest_lunch: 'Changed by staff' }),
        });
        if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
        // The status code is not proof: read the plan back.
        const after = await prisma.dietTemplate.findUnique({ where: { id: plan.id } });
        if (JSON.stringify(after) !== JSON.stringify(plan)) {
          // Put the demo plan back before failing, so a broken server does not leave it edited.
          const { id, ...fields } = plan;
          await prisma.dietTemplate.update({ where: { id }, data: fields });
          throw new Error('the plan changed although the edit was refused');
        }
      } finally {
        await prisma.user.deleteMany({ where: { email } });
      }
    }],
    ['an administrator cannot switch off their own sign-in, even with another administrator (#928)', async () => {
      const email = 'validation-admin2@example.com';
      await prisma.user.deleteMany({ where: { email } });
      const made = await post('/users', { email, role: 'admin', password: 'adminpass123' });
      if (made.status !== 201) throw new Error(`creating admin returned ${made.status}: ${await made.text()}`);
      const me = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
      try {
        const res = await fetch(`${API_BASE}/users/${me.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ is_active: false }),
        });
        const after = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
        if (!after.is_active) throw new Error('the account was switched off');
        if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
      } finally {
        await prisma.user.update({ where: { id: me.id }, data: { is_active: true } });
        await prisma.user.deleteMany({ where: { email } });
      }
    }],
    ['a person switched off, or gone from the centre, is signed out at once (#574)', async () => {
      const email = 'validation-gone@example.com';
      await prisma.user.deleteMany({ where: { email } });
      const made = await post('/users', { email, role: 'staff', password: 'staffpass123' });
      if (made.status !== 201) throw new Error(`creating staff returned ${made.status}: ${await made.text()}`);
      try {
        const login = await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'staffpass123' }) });
        const { token: t } = await login.json();
        const me = () => fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
        if ((await me()).status !== 200) throw new Error('a new sign-in should work');
        await prisma.user.update({ where: { email }, data: { is_active: false } });
        if ((await me()).status !== 401) throw new Error('a switched-off person kept their session');
        await prisma.user.delete({ where: { email } });
        if ((await me()).status !== 401) throw new Error('a person absent from the centre kept their session');
      } finally {
        await prisma.user.deleteMany({ where: { email } });
      }
    }],
    ['a person changes their own sign-in email, and Settings knows a demo password (#906)', async () => {
      const email = 'validation-email@example.com';
      const moved = 'validation-email-new@example.com';
      await prisma.user.deleteMany({ where: { email: { in: [email, moved] } } });
      const made = await post('/users', { email, role: 'staff', password: 'demo1234' });
      if (made.status !== 201) throw new Error(`creating staff returned ${made.status}`);
      try {
        const login = await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234' }) });
        const { token: t } = await login.json();
        const as = (path: string, body?: unknown) => fetch(`${API_BASE}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: body ? JSON.stringify(body) : undefined });
        if (!(await (await as('/account')).json()).demo_password) throw new Error('the demo password was not noticed');
        if ((await as('/account/change-email', { email: moved, current_password: 'wrong' })).status !== 400) throw new Error('a wrong password changed the email');
        if ((await as('/account/change-email', { email: ADMIN_EMAIL, current_password: 'demo1234' })).status !== 409) throw new Error("took another person's email");
        const ok = await as('/account/change-email', { email: ` ${moved.toUpperCase()} `, current_password: 'demo1234' });
        const body = await ok.json();
        if (ok.status !== 200 || body.email !== moved || 'password_hash' in body) throw new Error(`change answered ${ok.status} ${JSON.stringify(body)}`);
        const again = await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: moved, password: 'demo1234' }) });
        if (again.status !== 200) throw new Error('cannot sign in with the new email');
        await as('/account/change-password', { current_password: 'demo1234', new_password: 'another-pass-1' });
        if ((await (await as('/account')).json()).demo_password) throw new Error('still nagged after changing the password');
      } finally {
        await prisma.user.deleteMany({ where: { email: { in: [email, moved] } } });
      }
    }],
    ['there is no route that deletes every treatment at once (#410)', async () => {
      const before = await prisma.appointment.count();
      const res = await fetch(`${API_BASE}/appointments`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const after = await prisma.appointment.count();
      if (res.status !== 404 || after !== before) throw new Error(`answered ${res.status}; ${before - after} treatments deleted`);
    }],
  ];

  let failed = 0;
  for (const [name, run] of cases) {
    try {
      await run();
      console.log(`ok   ${name}`);
    } catch (err) {
      failed++;
      console.error(`FAIL ${name}`);
      console.error(`     ${err instanceof Error ? err.message.split('\n')[0] : err}`);
    }
  }
  console.log(`\n${cases.length - failed}/${cases.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
