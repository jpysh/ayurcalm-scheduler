#!/bin/sh
# Standby (#246): bring every centre up on this machine from the newest R2
# backups, then run the tunnel here. The addresses stay the same: a tunnel
# serves from wherever its connector runs. Stop the tunnel on the old host
# first if it is still alive (docker compose -p ruta-host down).
#   sh hosting/failover.sh
set -eu
cd "$(dirname "$0")/.."
DATA=${RUTA_DATA:-$HOME/ruta-data}
r2() { docker run --rm --env-file "$DATA/r2.env" -v "$PWD/hosting/offsite.sh:/offsite.sh:ro" -v "$DATA:/out" --entrypoint sh rclone/rclone:1.71 /offsite.sh "$@"; }
start=$(date +%s)
r2 tunnel /out
# Each "hostname: <slug>.jains.es" line is followed by its "service: ...:<port>".
grep -A1 'hostname:' "$DATA/tunnel.yml" | paste - - | sed -E 's/.*hostname: ([a-z0-9-]+)\.jains\.es.*:([0-9]+).*/\1 \2/' | while read -r slug port; do
  [ "$slug" = signup ] && continue
  sh hosting/centre.sh up "$slug" "$port"
  until curl -sf "localhost:$port/api/health" >/dev/null; do sleep 3; done
  f=$(r2 restore "$slug" "/out/$slug/restore" | tail -1)
  docker compose -p "ruta-$slug" stop app
  gunzip -c "$DATA/${f#/out/}" | docker compose -p "ruta-$slug" exec -T db psql -q -U ayurcalm ayurcalm >/dev/null
  docker compose -p "ruta-$slug" start app
  echo "$slug restored from $(basename "$f")"
done
docker compose -f hosting/compose.yml -p ruta-host up -d
echo "failover done in $(( $(date +%s) - start ))s"
