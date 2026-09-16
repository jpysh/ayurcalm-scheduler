import { PrismaClient } from '@prisma/client';

/**
 * Tests that write to the database refuse to run against a real centre.
 *
 * `demo_data` is set by the seed and cleared by Settings → Clear demo data, so
 * it marks an install that exists to be experimented on. A test that creates
 * rows and tidies up afterwards leaves those rows behind if it fails halfway,
 * and on a centre's own database that is somebody's schedule.
 *
 * Set ALLOW_TEST_WRITES=1 to override, if you know what the database is.
 */
export async function requireDemoData(prisma: PrismaClient) {
  if (process.env.ALLOW_TEST_WRITES === '1') return;
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  if (settings?.demo_data) return;
  console.error(
    'Refusing to run: this test writes to the database, and this database is not\n' +
    'marked as demo data. Point DATABASE_URL at a seeded test install, or set\n' +
    'ALLOW_TEST_WRITES=1 if you are certain.'
  );
  process.exit(1);
}
