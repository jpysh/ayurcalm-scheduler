#!/bin/bash
# #1178: a release's migrations run on a copy of a real centre's backup before
# any centre gets them. The newest backup under ~/ruta-data is restored into a
# throwaway stack, the checkout's app starts on it (its start runs the
# migrations; the seed skips a database that has data), and health and every
# table's row count must hold. Backups are only read, never written.
#   bash scripts/migration-test.sh [backup.sql.gz]
set -eu
P=mig1178; PORT=${MIG_PORT:-8396}; T=$(mktemp -d)
F=${1:-$(ls -1t "$HOME"/ruta-data/*/backups/ayurcalm-*.sql.gz 2>/dev/null | head -1)}
[ -f "$F" ] || { echo "FAIL: no backup found under ~/ruta-data"; exit 1; }
export COMPOSE_PROJECT_NAME=$P APP_PORT=$PORT BACKUP_DIR=$T/bk
trap 'docker compose -p $P down -v >/dev/null 2>&1; rm -rf $T' EXIT
psql() { docker compose -p $P exec -T db psql -qtA -U ayurcalm ayurcalm "$@"; }
counts() { # one "table rows" line per table, exact counts
  psql -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY 1" |
    while read -r t; do echo "$t $(psql -c "SELECT count(*) FROM \"$t\"" </dev/null)"; done
}
docker compose -p $P up -d --wait db >/dev/null 2>&1
gunzip -c "$F" | psql -v ON_ERROR_STOP=1 >/dev/null 2>"$T/restore.err" || { echo "FAIL: backup did not restore"; head -5 "$T/restore.err"; exit 1; }
counts > "$T/before"; [ -s "$T/before" ] || { echo "FAIL: backup restored no tables"; exit 1; }
docker compose -p $P up -d --build app >/dev/null 2>&1
i=0; until curl -sf "http://localhost:$PORT/api/health" >/dev/null; do
  i=$((i+1)); [ $i -gt 150 ] && { echo "FAIL: app did not come up on the restored backup"; docker compose -p $P logs app | tail -20; exit 1; }; sleep 2
done
counts > "$T/after"
# A table a migration dropped is a deliberate change; rows lost from a table that is still there are not.
lost=$(LC_ALL=C join <(LC_ALL=C sort "$T/before") <(LC_ALL=C sort "$T/after") | awk '$3 < $2 {print $1" "$2" -> "$3}')
[ -z "$lost" ] || { echo "FAIL: rows lost after migration:"; echo "$lost"; exit 1; }
echo "PASS  $(basename "$(dirname "$(dirname "$F")")")/$(basename "$F") migrated: health ok, $(wc -l < "$T/before" | tr -d ' ') tables, no rows lost"
