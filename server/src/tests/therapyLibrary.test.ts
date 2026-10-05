/**
 * Therapy library (#219): the library lists what the centre lacks, and an
 * import adds a therapy once, as edited, never twice under the same name.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { therapyLibrary } from '../therapyLibrary.js';

const prisma = new PrismaClient();
const API = process.env.API_BASE || 'http://localhost:4000/api';
const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) });
const { token } = await login.json();
const call = (path: string, body?: unknown) => fetch(`${API}${path}`, {
  method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined,
});

assert.ok(therapyLibrary.length >= 35, 'about forty therapies');
assert.equal(new Set(therapyLibrary.map((t) => t.name)).size, therapyLibrary.length, 'no duplicates in the library');

assert.deepEqual(therapyLibrary.find((t) => t.consultation)?.amenities, [], 'a consultation needs no room fittings, or a new centre has no doctor time to book');

const name = `Library test ${Date.now()}`;
const item = { name, duration_minutes: 45, staff_required: 1, products: ['Sesame oil'] };
try {
  const first = await (await call('/therapies/import', { items: [item] })).json();
  assert.deepEqual(first, { created: 1, skipped: 0 });
  const again = await (await call('/therapies/import', { items: [{ ...item, name: name.toUpperCase() }] })).json();
  assert.deepEqual(again, { created: 0, skipped: 1 }, 'the same name is not added twice');
  const saved = await prisma.therapy.findFirst({ where: { name } });
  assert.deepEqual(saved?.products, ['Sesame oil']);
  const list = await (await call('/therapy-library')).json();
  assert.ok(list.every((t: { added: boolean }) => typeof t.added === 'boolean'));
  console.log('therapy library: ok');
} finally {
  await prisma.therapy.deleteMany({ where: { name } });
  await prisma.$disconnect();
}
