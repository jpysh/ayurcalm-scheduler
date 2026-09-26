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
run offHours         "A therapist out for some hours, or a room out of use, is refused only in those hours"
run therapistRota      "The therapist rota shows who works when, and why someone is away"
run scheduleInvariants "The demo schedule has no double bookings and today is properly full"
run validation         "A half-filled form is refused politely, not crashed on, and nobody signed out can save, and staff cannot change a diet plan"
run autoAssign         "Auto-booking a course respects gender, holidays, and times already past"
run replanSimulation   "When a therapist is absent, their day moves to others without clashes, and Undo restores it"
run dayCheckParity     "Verify flags exactly the treatments the app would refuse to save, co-therapists included"
run coTherapist        "A treatment worked by two books both therapists: neither can be booked elsewhere in that hour, and it is never booked short-handed"
run dayPlan            "Verify's fix for a day is one plan with no clashes, and accepting then undoing it restores the day"
run ownTherapist       "A resident kept to their own therapist goes to that therapist's next free day when it is soon, and otherwise the admin is asked with three choices"
run daySheet           "The day sheet lists every resident, treatment time and therapist, in its groups, with no empty boxes"
run dietOverride       "Editing a diet plan changes it for everyone except what one patient was told specifically"
run onboarding         "After the setup wizard, the centre has its hours, timezone, therapies, rooms and therapists, and the day sheet prints"
run mcp                "Claude reads the centre only with the current key: the day, residents, who is free and the day sheet, and reading changes nothing"

# A browser walk, run from the checkout against the stack: it needs Chromium
# (npx playwright install chromium) on the machine running this.
if E2E_BASE_URL="http://localhost:$PORT" npx playwright test absenceReplan >"$log" 2>&1; then
  echo "  PASS  In the browser: a therapist marked off shows in Verify, its plan clears the day, and Undo puts the day back"
  passed=$((passed + 1))
else
  echo "  FAIL  In the browser: a therapist marked off shows in Verify, its plan clears the day, and Undo puts the day back"
  sed 's/^/        /' "$log" | tail -15
  failed=$((failed + 1))
fi

# The wizard is read from the checkout, not the container: the app image carries
# only the built front end. Onboarding speed is the point of the wizard, so it
# may not grow a screen or a field without someone lowering these on purpose.
WIZARD=src/pages/SetupWizard.tsx
MAX_SCREENS=3
MAX_FIELDS=7
screens=$(grep -o 'step === [0-9]* && (' "$WIZARD" | sort -u | wc -l | tr -d ' ')
fields=$(grep -c '<Label' "$WIZARD")
if [ "$screens" -le "$MAX_SCREENS" ] && [ "$fields" -le "$MAX_FIELDS" ]; then
  echo "  PASS  The setup wizard is still $screens screens and $fields fields, no more than $MAX_SCREENS and $MAX_FIELDS"
  passed=$((passed + 1))
else
  echo "  FAIL  The setup wizard has grown to $screens screens and $fields fields (limit $MAX_SCREENS and $MAX_FIELDS)"
  failed=$((failed + 1))
fi

rm -f "$log"
echo ""
if [ "$failed" -eq 0 ]; then
  echo "All $passed checks passed."
else
  echo "$failed of $((passed + failed)) checks failed. The lines under each FAIL say what went wrong."
  exit 1
fi
