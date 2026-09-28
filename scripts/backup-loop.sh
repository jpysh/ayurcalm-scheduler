#!/bin/sh
# The backup service (#236): a database backup when the stack starts and every
# night at 02:30 India time (21:00 UTC), gzip, the newest 14 kept in /backups.
# pg_dump --clean makes each file restorable over an existing database.
set -u
backup() {
  f="/backups/ayurcalm-$(date -u +%Y%m%d-%H%M).sql.gz"
  if pg_dump -h db -U "$PGUSER" --clean --if-exists "$PGDATABASE" | gzip > "$f.tmp"; then
    mv "$f.tmp" "$f"; echo "backup written: $f"
  else
    rm -f "$f.tmp"; echo "backup FAILED" >&2
  fi
  ls -1t /backups/ayurcalm-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
}
backup
[ "${1:-}" = once ] && exit 0
while true; do
  now=$(date -u +%s)
  sleep $(( (75600 - now % 86400 + 86400) % 86400 + 1 ))
  backup
done
