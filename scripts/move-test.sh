#!/bin/sh
# #231: a centre moves from a self-hosted install to a cloud trial install and
# back in one "Download everything" file, and today's day sheet prints the same
# text on each. Stack A is the running default project (qa leaves it up);
# stack B is a throwaway cloud-style install (TRIAL=true) on :8093 (B_PORT).
#   sh scripts/move-test.sh            (CI runs it after e2e)
set -eu
A=${A_URL:-http://localhost:${APP_PORT:-8080}}; BP=${B_PORT:-8093}; B=http://localhost:$BP
PA=${COMPOSE_PROJECT_NAME:-ayurcalm-scheduler}; PB=move-b; T=$(mktemp -d)
trap 'docker compose -p $PB down -v >/dev/null 2>&1; rm -rf $T' EXIT
login() { curl -sf "$1/api/auth/login" -H 'content-type: application/json' -d '{"email":"admin@example.com","password":"demo1234"}' | sed 's/.*"token":"\([^"]*\)".*/\1/'; }
sheet() { # day sheet text, without the line that names when it was printed
  curl -sf -H "Authorization: Bearer $(login "$1")" "$1/api/daily-schedule-pdf?date=$(date +%F)" -o "$T/s.pdf"
  docker compose -p "$2" exec -T app pdftotext -layout - - < "$T/s.pdf" | grep -v -i 'printed'
}
move() { # export from $1, import into $3
  curl -sf -H "Authorization: Bearer $(login "$1")" "$1/api/settings/export" -o "$T/f.json.gz"
  curl -sf -H "Authorization: Bearer $(login "$3")" -H 'content-type: application/octet-stream' --data-binary @"$T/f.json.gz" "$3/api/settings/import" >/dev/null
}
TRIAL=true APP_PORT=$BP BACKUP_DIR=$T/bk RATE_LIMIT_WRITES=1000 RATE_LIMIT_CALLS=10000 docker compose -p $PB up -d >/dev/null 2>&1
i=0; until curl -sf $B/api/health >/dev/null; do i=$((i+1)); [ $i -gt 150 ] && { echo "stack B did not start"; exit 1; }; sleep 2; done
sheet $A $PA > $T/a.txt
[ -s $T/a.txt ] || { echo "FAIL: no day sheet from A"; exit 1; }
# B starts as a different centre, so a no-op import could not pass.
docker compose -p $PB exec -T db psql -q -U ayurcalm ayurcalm -c 'UPDATE "Settings" SET centre_name = '"'"'Somewhere Else'"'"'' >/dev/null
move $A $PA $B
sheet $B $PB > $T/b.txt
diff -q $T/a.txt $T/b.txt >/dev/null || { echo "FAIL: self-host -> cloud changed the day sheet"; diff $T/a.txt $T/b.txt | head -20; exit 1; }
move $B $PB $A
sheet $A $PA > $T/a2.txt
diff -q $T/a.txt $T/a2.txt >/dev/null || { echo "FAIL: cloud -> self-host changed the day sheet"; diff $T/a.txt $T/a2.txt | head -20; exit 1; }
echo "PASS  A centre moved self-host -> cloud -> self-host prints the same day sheet ($(wc -l < $T/a.txt | tr -d ' ') lines)"
