#!/bin/sh
# One trial centre (or the demo) as its own compose project on this host (#246).
#   sh hosting/centre.sh up demo 8201     start or update ruta-demo on :8201
#   sh hosting/centre.sh down demo        stop it, data kept
#   stop|start <slug>: pause a trial and back; delete <slug>: its data is gone
#   reset-password <slug>: print a new password for the trial's admin (no email at launch, #247)
#   paid <slug> <cloud|onprem|founding> <YYYY-MM-DD>: record a payment (#250); paid <slug> none clears it
# Data lives in Docker volume ruta-<slug>_db-data; backups in $DATA/<slug>/backups.
# The slug "demo" runs DEMO_MODE with an hourly reset. Secrets are made once
# per centre and kept in $DATA/<slug>/env.
set -eu
cd "$(dirname "$0")/.."
DATA=${RUTA_DATA:-$HOME/ruta-data}
cmd=$1 slug=$2
case $slug in *[!a-z0-9-]*|"") echo "slug: a-z 0-9 - only" >&2; exit 1;; esac
dir=$DATA/$slug; mkdir -p "$dir/backups"
# A trial's TRIAL and ADMIN_EMAIL (#247) are kept with its secrets, so a later up or a failover keeps them.
[ -f "$dir/env" ] || printf 'JWT_SECRET=%s\nPOSTGRES_PASSWORD=%s\nTRIAL=%s\nADMIN_EMAIL=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 16)" "${TRIAL:-}" "${ADMIN_EMAIL:-}" > "$dir/env"
set -a; . "$dir/env"; set +a
export BACKUP_DIR="$dir/backups" BEHIND_CLOUDFLARE=true
if [ "$slug" = demo ]; then export DEMO_MODE=true DEMO_RESET_MINUTES=60; fi
case $cmd in
  up)   APP_PORT=${3:?port} docker compose -p "ruta-$slug" up -d --build ;;
  down)   docker compose -p "ruta-$slug" down ;;
  stop)   docker compose -p "ruta-$slug" stop ;;
  start)  docker compose -p "ruta-$slug" start ;;
  delete) docker compose -p "ruta-$slug" down -v && rm -rf "$dir" ;;
  reset-password) docker compose -p "ruta-$slug" exec -T app npx tsx server/src/scripts/resetPassword.ts "${ADMIN_EMAIL:?no ADMIN_EMAIL in $dir/env}" ;;
  paid)   docker compose -p "ruta-$slug" exec -T app npx tsx server/src/scripts/markPaid.ts "$3" "${4:-}" ;;
  *)    echo "up|down|stop|start|delete|reset-password|paid" >&2; exit 1 ;;
esac
