#!/bin/sh
# Fresh throwaway stacks for `node scripts/shots.mjs stories`: seeded :8092,
# a new cloud trial :8093 (owner@example.com / trial1234), the public demo :8094.
set -e
L="RATE_LIMIT_WRITES=1000 RATE_LIMIT_CALLS=100000"
up() { p=$1; port=$2; shift 2; docker compose -p "$p" down -v >/dev/null 2>&1 || true; env $L APP_PORT=$port "$@" docker compose -p "$p" up -d --build >/dev/null 2>&1; }
up ayurcalm-audit 8092
up ayurcalm-audit-trial 8093 TRIAL=true ADMIN_EMAIL=owner@example.com
up ayurcalm-audit-demo 8094 DEMO_MODE=true
for port in 8092 8093 8094; do until curl -sf localhost:$port/api/health >/dev/null; do sleep 3; done; done
docker compose -p ayurcalm-audit-trial exec -T app sh -c 'cd /app/server && npx tsx src/scripts/resetPassword.ts owner@example.com trial1234' >/dev/null
echo "stacks ready: 8092 8093 8094"
