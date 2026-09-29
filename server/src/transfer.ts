/**
 * Moving a centre between installs (#231): cloud to self-hosted and back.
 * Export is every table as JSON, gzipped, in one file the admin downloads;
 * import loads that file into an install that holds only the demo, replacing
 * it whole. Both installs must be on the same version, because the file is
 * the database's shape at that version. The server's signing secret is never
 * exported: a new install keeps its own, so everyone signs in again.
 */
import { PRODUCT } from './product.js';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Prisma, type PrismaClient } from '@prisma/client';

// Parents before children, so every row's references exist when it arrives.
const TABLES = [
  'settings', 'user', 'dietTemplate', 'staff', 'therapyRoom', 'therapy', 'patient', 'patientStay',
  'appointment', 'timeOff', 'dietPlan', 'dietPlanSegment', 'programEvent', 'auditLog', 'linkIssue', 'printedSheet',
] as const;
type Table = (typeof TABLES)[number];
type Delegate = { findMany: () => Promise<Record<string, unknown>[]>; deleteMany: () => Promise<unknown>; createMany: (a: { data: Record<string, unknown>[] }) => Promise<unknown> };
const table = (db: PrismaClient | Prisma.TransactionClient, t: Table) => (db as unknown as Record<Table, Delegate>)[t];

async function version(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<{ migration_name: string }[]>`select migration_name from _prisma_migrations where finished_at is not null order by migration_name desc limit 1`;
  return rows[0]?.migration_name ?? 'none';
}

export async function exportCentre(prisma: PrismaClient) {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows = await table(prisma, t).findMany();
    // A PDF's bytes as base64: JSON would spell each byte out as a number.
    tables[t] = t === 'printedSheet' ? rows.map((r) => ({ ...r, pdf: Buffer.from(r.pdf as Uint8Array).toString('base64') })) : rows;
  }
  return gzipSync(JSON.stringify({ app: 'ayurcalm', version: await version(prisma), exported_at: new Date().toISOString(), tables }));
}

export class ImportRefused extends Error {}

export async function importCentre(file: Buffer, prisma: PrismaClient) {
  let data: { app?: string; version?: string; tables?: Record<string, Record<string, unknown>[]> };
  try { data = JSON.parse(gunzipSync(file).toString('utf8')); } catch { throw new ImportRefused(`That is not a ${PRODUCT} export file.`); }
  if (data.app !== 'ayurcalm' || !data.tables) throw new ImportRefused(`That is not a ${PRODUCT} export file.`);
  if (data.version !== (await version(prisma))) throw new ImportRefused(`That file comes from a different version of ${PRODUCT}. Update both to the same version, then export again.`);
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  if (settings && !settings.demo_data && (await prisma.patient.count()) > 0) {
    throw new ImportRefused("This install already holds a centre's own data. Load the file into a new install.");
  }
  if (!data.tables.user?.some((u) => u.role === 'admin')) throw new ImportRefused('That file has no administrator, so nobody could sign in.');
  const tables = data.tables;
  await prisma.$transaction(async (tx) => {
    for (const t of [...TABLES].reverse()) await table(tx, t).deleteMany();
    for (const t of TABLES) {
      const rows = (tables[t] || []).map((r) => {
        // An absent optional value is stored as none; Prisma refuses a bare null for a JSON column.
        const row = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null));
        return t === 'printedSheet' ? { ...row, pdf: Buffer.from(String(row.pdf), 'base64') } : row;
      });
      for (let i = 0; i < rows.length; i += 1000) await table(tx, t).createMany({ data: rows.slice(i, i + 1000) });
    }
  }, { timeout: 5 * 60 * 1000, maxWait: 30000 });
  return Object.fromEntries(TABLES.map((t) => [t, (tables[t] || []).length]));
}
