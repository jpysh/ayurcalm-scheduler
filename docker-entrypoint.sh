#!/bin/sh
# Applies migrations on every boot and seeds demo data only on an empty
# database, so `docker compose up` is the whole install and a restart never
# overwrites real data.
set -e

cd /app/server

echo "[entrypoint] waiting for database..."
until npx prisma migrate deploy >/dev/null 2>&1; do
  sleep 2
done
npx prisma migrate deploy

# The Patient table is the marker: no patients means a fresh install.
NEEDS_SEED=$(node -e "
import('@prisma/client').then(async ({ PrismaClient }) => {
  const p = new PrismaClient();
  try {
    const n = await p.patient.count();
    process.stdout.write(n === 0 ? 'yes' : 'no');
  } catch { process.stdout.write('yes'); }
  await p.\$disconnect();
});
")

if [ "$NEEDS_SEED" = "yes" ]; then
  echo "[entrypoint] empty database — seeding demo data..."
  npx tsx src/seed.ts || echo "[entrypoint] seed failed; continuing with an empty database"
else
  echo "[entrypoint] existing data found — skipping seed"
fi

exec "$@"
