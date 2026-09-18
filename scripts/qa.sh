#!/bin/sh
# npm run qa — every server test, against the local stack, with a plain-English
# result per test. CI runs this same script, so a pass here is a pass there.
#
# It always runs `docker compose up -d --build` first: the tests run inside the
# app container, and a container built before your last edit would test old code.
# The database volume is kept, so nothing already in the app is lost.

set -u
cd "$(dirname "$0")/.."
PORT="${APP_PORT:-8080}"

echo "Starting the app (or bringing it up to date)..."
docker compose up -d --build >/dev/null 2>&1 || { echo "Could not start the app with Docker. Is Docker running?"; exit 1; }
i=0
until curl -sf "http://localhost:$PORT/api/health" >/dev/null; do
  i=$((i + 1))
  [ "$i" -gt 150 ] && { echo "The app did not come up within 5 minutes. See: npm run dev:logs"; exit 1; }
  sleep 2
done

passed=0
failed=0
log=$(mktemp)

run() { # script, what it checks
  if docker compose exec -T -w /app/server -e API_BASE=http://localhost:4000/api app \
      npx tsx "src/tests/$1.test.ts" >"$log" 2>&1; then
    echo "  PASS  $2"
    passed=$((passed + 1))
  else
    echo "  FAIL  $2"
    sed 's/^/        /' "$log" | tail -15
    failed=$((failed + 1))
  fi
}

echo ""
echo "Checking the app:"
run dietResolution     "Each resident gets the right meals for their diet plan on a given day"
run shortenWords       "Long names are shortened sensibly to fit the day sheet"
run availability       "A therapist counts as busy during their absences and the centre's events"
run therapistRota      "The therapist rota shows who works when, and why someone is away"
run scheduleInvariants "The demo schedule has no double bookings and today is properly full"
run validation         "A half-filled form is refused politely, not crashed on, and nobody signed out can save"
run autoAssign         "Auto-booking a course respects gender, holidays, and times already past"
run replanSimulation   "When a therapist is absent, their day moves to others without clashes, and Undo restores it"
run dayCheckParity     "Verify flags exactly the treatments the app would refuse to save"
run dayPlan            "Verify's fix for a day is one plan with no clashes, and accepting then undoing it restores the day"

rm -f "$log"
echo ""
if [ "$failed" -eq 0 ]; then
  echo "All $passed checks passed."
else
  echo "$failed of $((passed + failed)) checks failed. The lines under each FAIL say what went wrong."
  exit 1
fi
