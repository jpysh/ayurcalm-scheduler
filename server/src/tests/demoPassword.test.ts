/**
 * An install still on demo1234 saves nothing but a new password (#1004); reads still work.
 * Calls the guard directly, because the test stacks set ALLOW_DEMO_PASSWORD.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { prisma } from '../server.js';
import { demoPasswordGuard } from '../users.js';

const EMAIL = 'demo-password-test@example.com';

async function asks(method: string, path: string, userId: string) {
  let status = 0, passed = false;
  const res = { status(s: number) { status = s; return this; }, json() { return this; } };
  await demoPasswordGuard({ method, path, user: { id: userId } } as never, res as never, () => { passed = true; });
  return passed ? 'through' : status;
}

async function main() {
  delete process.env.ALLOW_DEMO_PASSWORD;
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const u = await prisma.user.create({ data: { email: EMAIL, role: 'admin', password_hash: await bcrypt.hash('demo1234', 10) } });
  try {
    assert.equal(await asks('POST', '/appointments', u.id), 403, 'demo1234 saved a booking');
    assert.equal(await asks('GET', '/appointments', u.id), 'through', 'demo1234 could not read');
    assert.equal(await asks('POST', '/account/change-password', u.id), 'through', 'demo1234 could not be changed');
    await prisma.user.update({ where: { id: u.id }, data: { password_hash: await bcrypt.hash('a-real-password', 10) } });
    assert.equal(await asks('POST', '/appointments', u.id), 'through', 'a changed password still could not save');
  } finally { await prisma.user.deleteMany({ where: { email: EMAIL } }); }
  console.log('demo1234 reads and changes its password, and saves nothing else until it is changed.');
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
