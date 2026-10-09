#!/bin/sh
# The 07:00 daily check (#248): one plain line per thing that can go wrong on
# a host, then exit 1 if any did, so a scheduled task or a person only has to
# read the lines marked PROBLEM. Usage: daily-check.sh https://demo.example/ ...
set -u
bad=0
ok()   { echo "ok       $*"; }
fail() { echo "PROBLEM  $*"; bad=1; }

for url in "$@"; do
  body=$(curl -s -m 15 "${url%/}/api/health")
  case "$body" in *'"ok":true'*) ok "$url answers" ;; *) fail "$url does not answer: ${body:-no reply}" ;; esac
done

# 26 hours: the nightly run plus slack, so one late night is not an alarm but
# a missed one is.
for c in $(docker ps -a --format '{{.Names}}' | grep -- '-backup-'); do
  age=$(docker exec "$c" sh -c 'f=$(ls -1t /backups/ayurcalm-*.sql.gz 2>/dev/null | head -1); [ -n "$f" ] && echo $(( $(date +%s) - $(stat -c %Y "$f") ))' 2>/dev/null)
  if [ -z "$age" ]; then fail "$c has no backup (or is not running)"
  elif [ "$age" -gt 93600 ]; then fail "$c newest backup is $((age / 3600)) hours old"
  else ok "$c backed up $((age / 3600)) hours ago"; fi
done

for c in $(docker ps -a --filter status=exited --filter status=restarting --format '{{.Names}}'); do
  fail "container $c is not running"
done

used=$(df -P / | awk 'NR==2 {print $5}' | tr -d %)
[ "$used" -lt 85 ] && ok "disk ${used}% used" || fail "disk ${used}% used"

exit $bad
