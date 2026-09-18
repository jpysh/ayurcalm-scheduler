/**
 * Editing a diet plan changes what everyone on it eats, except where the doctor
 * told one patient something different. That patient's override must survive
 * the edit, through the real write path: the plan is edited over the API, and
 * the day sheet is read back the way the kitchen reads it.
 *
 * Two residents on one plan, on a day in 2030. One has lunch overridden. After
 * the plan's lunch and dinner are changed, the overridden resident still gets
 * their own lunch and the new dinner; the other gets both new meals.
 *
 * Needs a running server and its database: API_BASE and DATABASE_URL.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { generateDailySchedulePdf } from '../pdf/dailySchedulePdf.js';
import { requireDemoData } from './demoGuard.js';

const TAG = 'Diettest';
const DAY = '2030-02-12';
const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4100}/api`;
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'demo1234';

async function tidy(prisma: PrismaClient) {
  const ids = (await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((p) => p.id);
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.dietPlanSegment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  await prisma.dietTemplate.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  const prisma = new PrismaClient();
  const dir = mkdtempSync(join(tmpdir(), 'dietoverride-'));
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
    const call = async (method: string, path: string, body: unknown) => {
      const res = await fetch(`${API_BASE}${path}`, {
        method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      assert.ok(res.ok, `${method} ${path} returned ${res.status}: ${await res.clone().text()}`);
      return res.json();
    };

    // A rest day for both (no treatments), so the sheet prints the rest_ meals.
    const plan = await call('POST', '/diet-templates', {
      name: `${TAG} Plan`, rest_breakfast: 'Porridge', rest_lunch: 'Plain khichdi', rest_dinner: 'Moong soup',
    });
    const day = new Date(`${DAY}T00:00:00.000Z`);
    const told = 'Khichdi without salt';
    const residents = [];
    for (const [name, overrides] of [[`${TAG} Anu`, { rest_lunch: told }], [`${TAG} Bina`, undefined]] as const) {
      const p = await prisma.patient.create({ data: { name, gender: 'female' } });
      await prisma.patientStay.create({ data: { patient_id: p.id, start_date: day, end_date: day, duration_days: 1 } });
      await call('POST', '/dietplans/segments', { patient_id: p.id, start_date: DAY, end_date: DAY, template_id: plan.id, overrides });
      residents.push(p);
    }

    await call('PUT', `/diet-templates/${plan.id}`, { rest_lunch: 'Vegetable upma', rest_dinner: 'Lauki soup' });

    const seg = await prisma.dietPlanSegment.findFirst({ where: { patient_id: residents[0].id } });
    assert.deepEqual(seg?.overrides, { rest_lunch: told }, "Editing the plan changed Anu's own override");

    const pdfPath = join(dir, 'sheet.pdf');
    writeFileSync(pdfPath, await generateDailySchedulePdf(DAY, prisma));
    const text = execFileSync('pdftotext', ['-raw', pdfPath, '-']).toString().replace(/\s+/g, ' ');
    const a = text.indexOf(`${TAG} Anu`);
    const b = text.indexOf(`${TAG} Bina`);
    assert.ok(a >= 0 && b > a, 'Both residents should be on the sheet, Anu first');
    // The sheet heads each resident's row with their meals, so each block runs
    // from the plan heading above them to their name.
    const anu = text.slice(text.lastIndexOf(`${TAG} Plan`, a), a);
    const bina = text.slice(text.lastIndexOf(`${TAG} Plan`, b), b);
    assert.ok(anu.includes(told), `Anu should still be given "${told}"`);
    assert.ok(!anu.includes('Vegetable upma'), "The plan's new lunch replaced what Anu was told");
    assert.ok(anu.includes('Lauki soup'), "Anu's dinner did not follow the plan's edit");
    assert.ok(bina.includes('Vegetable upma') && bina.includes('Lauki soup'), 'Bina did not get the edited plan');
    assert.ok(!text.includes('Plain khichdi') && !text.includes('Moong soup'), 'The old meals are still on the sheet');

    console.log('Diet plan edit: the plan moved for everyone, and the override stayed what the patient was told.');
  } finally {
    await tidy(prisma).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
