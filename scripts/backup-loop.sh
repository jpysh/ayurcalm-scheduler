#!/bin/sh
# The backup service (#236): a database backup ten minutes after the stack
# starts and every night at 02:30 India time (21:00 UTC), gzip, the newest 14
# kept in /backups. pg_dump --clean makes each file restorable over an
# existing database.
set -u
backup() {
  f="/backups/ayurcalm-$(date -u +%Y%m%d-%H%M).sql"
  # Dump, then compress: in a pipe a failed dump would still leave a small,
  # valid-looking file that pushes a good backup out of the 14 kept.
  if pg_dump -h db -U "$PGUSER" --clean --if-exists "$PGDATABASE" > "$f.tmp" && gzip -c "$f.tmp" > "$f.gz.tmp"; then
    mv "$f.gz.tmp" "$f.gz"; echo "backup written: $f.gz"
  else
    rm -f "$f.gz.tmp"; echo "backup FAILED" >&2
  fi
  rm -f "$f.tmp"
  ls -1t /backups/ayurcalm-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
}
[ "${1:-}" = once ] && { backup; exit 0; }
# Not at once: on a first start the app has not yet built the database, and a
# restart loop of near-empty backups would rotate the real ones away.
sleep 600
backup
while true; do
  now=$(date -u +%s)
  sleep $(( (75600 - now % 86400 + 86400) % 86400 + 1 ))
  backup
done
