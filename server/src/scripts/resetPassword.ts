/**
 * Last resort when nobody can sign in — run on the machine hosting the app:
 *
 *   docker compose exec app npx tsx server/src/scripts/resetPassword.ts you@example.com
 *
 * Requires shell access to the server, which is the point: it is the proof of
 * ownership that replaces an email round-trip on a self-hosted install.
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const supplied = process.argv[3];

  if (!email) {
    const users = await prisma.user.findMany({
      select: { email: true, role: true, is_active: true },
      orderBy: { email: 'asc' },
    });
    console.log('\nUsage: resetPassword.ts <email> [new-password]');
    console.log('A password is generated for you when you do not supply one.\n');
    console.log('Accounts on this install:');
    for (const u of users) {
      console.log(`  ${u.email}  (${u.role}${u.is_active ? '' : ', disabled'})`);
    }
    console.log('');
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No account with the email ${email}. Run without arguments to list accounts.`);
    process.exitCode = 1;
    return;
  }

  // 12 URL-safe characters: long enough to be safe, short enough to retype.
  const password = supplied || randomBytes(9).toString('base64url').slice(0, 12);
  if (password.length < 8) {
    console.error('A password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    // Re-enable the account: a locked-out admin who also disabled themselves
    // would otherwise still be unable to sign in.
    data: { password_hash: await bcrypt.hash(password, 10), is_active: true },
  });

  console.log(`\n  Password reset for ${user.email}\n`);
  console.log(`    New password:  ${password}\n`);
  console.log('  Sign in, then change it from Settings.\n');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
