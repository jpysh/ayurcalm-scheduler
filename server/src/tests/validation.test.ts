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
    ['a programme event with no recurrence is created, not a 500', async () => {
      const res = await post('/program-events', {
        start_time: '10:00', end_time: '11:00', activity_name: 'Validation Test Event',
        recurrence: null, weekdays: null, notes: null, date: today(),
      });
      if (res.status !== 201) throw new Error(`status ${res.status}: ${await res.text()}`);
      const { id } = await res.json();
      if (id) await prisma.programEvent.delete({ where: { id } });
    }],

    ['time off with no recurrence is created, not a 500', async () => {
      const res = await post('/timeoff', {
        entity_type: 'center', start_date: today(), end_date: today(),
        recurrence: null, weekdays: null, description: 'Validation Test TimeOff',
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
