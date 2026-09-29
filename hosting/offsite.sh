#!/bin/sh
# Off-site copy of every centre's backups to Cloudflare R2, encrypted (#246).
# Runs inside the rclone container (hosting/compose.yml), nightly at 03:30 IST.
#   /data/<slug>/backups/*.sql.gz  ->  r2:ruta-backups/nightly/<slug>/  (mirror: the 14 kept locally)
#                                  ->  r2:ruta-backups/weekly/<slug>/   (Sundays; 8 kept)
# rclone's crypt remote encrypts names and contents with RUTA_BACKUP_PASSWORD.
#   sh offsite.sh once     one copy now      sh offsite.sh restore <slug> <dir>   newest file back
set -eu
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
  RCLONE_CONFIG_SAFE_TYPE=crypt RCLONE_CONFIG_SAFE_REMOTE=r2:ruta-backups RCLONE_CONFIG_SAFE_PASSWORD="$(rclone obscure "$RUTA_BACKUP_PASSWORD")"
copy() {
  for d in /data/*/backups; do
    slug=$(basename "$(dirname "$d")")
    rclone sync "$d" "safe:nightly/$slug" --include 'ayurcalm-*.sql.gz'
    if [ "$(date -u +%u)" = 7 ]; then
      newest=$(ls -1t "$d"/ayurcalm-*.sql.gz 2>/dev/null | head -1)
      [ -n "$newest" ] && rclone copy "$newest" "safe:weekly/$slug"
      rclone delete "safe:weekly/$slug" --min-age 55d
    fi
  done
  rclone copy /data/tunnel.yml safe:
  echo "offsite copy done $(date -u +%FT%TZ)"
}
case ${1:-loop} in
  once) copy ;;
  tunnel) rclone copy safe:tunnel.yml "$2" ;;
  restore) f=$(rclone lsf "safe:nightly/$2" | sort | tail -1); rclone copy "safe:nightly/$2/$f" "$3"; echo "$3/$f" ;;
  loop) while true; do now=$(date -u +%s); sleep $(( (79200 - now % 86400 + 86400) % 86400 + 1 )); copy || echo "offsite copy FAILED" >&2; done ;;
esac
