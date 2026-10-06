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
RATE_LIMIT_WRITES=1000 RATE_LIMIT_CALLS=10000 docker compose up -d --build >/dev/null 2>&1 || { echo "Could not start the app with Docker. Is Docker running?"; exit 1; }
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
run scheduleInvariants "The demo schedule has no double bookings, today is properly full, and today has a therapist off to fix"
run validation         "A half-filled form is refused politely, not crashed on, and nobody signed out can save, and staff cannot change a diet plan"
run autoAssign         "Auto-booking a course respects gender, holidays, and times already past"
run links              "A private link shows a person their own day only, records on their own treatments, and stops working when reissued"
run replanSimulation   "When a therapist is absent, their day moves to others without clashes, and Undo restores it"
run dayCheckParity     "Verify flags exactly the treatments the app would refuse to save, co-therapists included"
run coTherapist        "A treatment worked by two books both therapists: neither can be booked elsewhere in that hour, and it is never booked short-handed"
run dayPlan            "Verify's fix for a day is one plan with no clashes, and accepting then undoing it restores the day"
run ownTherapist       "A resident kept to their own therapist goes to that therapist's next free day when it is soon, and otherwise the admin is asked with three choices"
run therapyLibrary     "The therapy library adds a therapy once, as edited, never twice under the same name"
run printedSheets      "Printing a day keeps one copy of each sheet, replaced by the next print, and copies older than 90 days are removed"
run transfer           "A centre exported to one file and imported again comes back whole; a file that is not an export, or from another version, changes nothing"
run discharge          "A discharge summary is written from the doctor's link and the card, numbered once, closed to the link when final, and prints on two A4 pages"
run doctors            "A doctor and their consultations print on the doctor rota, not the therapist rota"
run daySheet           "The day sheet lists every resident, treatment time and therapist, in its groups, with no empty boxes"
run unstaffedSheets   "A treatment booked with a therapist who is off shows, marked, on both the patient sheet and the therapist rota"
run nextWeek          "Plan next week repeats this week a week on, a swap changes one line, and Book all books every line and the review or nothing"
run residentStay     "A resident added in the app, with a stay and a diet plan, is on the day sheet; leaving early cancels what is left, and Undo restores it"
run patientStories   "Meals by date, what a discharge summary lacks, package and accommodation, a shortened stay cancelled with its reason and undone, a leave planned later"
run newPatient       "A new patient is saved with their details and a consultation booked through the guard, the booking sheet lists free therapists and rooms first, and patient search finds by name"
run treatmentCard    "Every time and room a treatment card offers saves, a busy therapist is not offered, a no-show frees theirs, and History says what changed"
run bookingRules    "Booking from +: a repeated therapy or a long day is asked about and books on Book anyway, and every dead end carries a way forward"
run search           "Search finds a resident's treatments on every day in the window, in order, by name, room or any therapist, and leaves out cancelled ones"
run residentDay      "A resident's card shows which day of their stay it is, today's treatments without cancelled ones, and meals as the day sheet prints them"
run attention       "What needs you: patient items follow the rules, a changed 'when' or an off switch changes them, the locked rule stays on, and Reset restores the defaults"
run changeLog        "The Log shows each change in words, newest first, and the newest fix from the day's check can be undone from it"
run dietOverride       "Editing a diet plan changes it for everyone except what one patient was told specifically"
run onboarding         "After the setup wizard, the centre has its hours, timezone, therapies, rooms and therapists, and the day sheet prints"
run mcp                "Claude reads the centre only with the current key: the day, residents, who is free and the day sheet, and reading changes nothing"
run mcpPlan            "Claude's plan for a day is the one Verify shows, written only on a yes, undone exactly; stale and expired plans write nothing"
run demo               "The public demo is put back to the seeded centre every six hours, on fixed hours a restart does not move"

# Backups (#236): write one with the service's own script, restore the newest
# file into a scratch database, and compare every table's row count with the live one.
counts='select string_agg(table_name || '"'"'='"'"' || (xpath('"'"'/row/c/text()'"'"', query_to_xml(format('"'"'select count(*) as c from %I'"'"', table_name), false, true, '"'"''"'"')))[1]::text, '"'"' '"'"' order by table_name) from information_schema.tables where table_schema = '"'"'public'"'"''
if docker compose exec -T backup sh -c "
    set -e
    sh /backup-loop.sh once
    f=\$(ls -1t /backups/ayurcalm-*.sql.gz | head -1)
    psql -h db -q -d postgres -c 'drop database if exists restorecheck' -c 'create database restorecheck'
    gunzip -c \"\$f\" | psql -h db -q -v ON_ERROR_STOP=1 -d restorecheck >/dev/null
    live=\$(psql -h db -At -c \"$counts\")
    back=\$(psql -h db -At -d restorecheck -c \"$counts\")
    psql -h db -q -d postgres -c 'drop database restorecheck'
    [ -n \"\$live\" ] && [ \"\$live\" = \"\$back\" ] || { echo \"live:     \$live\"; echo \"restored: \$back\"; exit 1; }
  " >"$log" 2>&1; then
  echo "  PASS  Last night's kind of backup restores into an empty database with every table's rows intact"
  passed=$((passed + 1))
else
  echo "  FAIL  Last night's kind of backup restores into an empty database with every table's rows intact"
  sed 's/^/        /' "$log" | tail -15
  failed=$((failed + 1))
fi

# A browser walk, run from the checkout against the stack: it needs Chromium
# (npx playwright install chromium) on the machine running this.
if E2E_BASE_URL="http://localhost:$PORT" npx playwright test absenceReplan >"$log" 2>&1; then
  echo "  PASS  In the browser: a therapist marked off shows in the pill's sheet, its fix clears the day, and Undo puts the day back"
  passed=$((passed + 1))
else
  echo "  FAIL  In the browser: a therapist marked off shows in the pill's sheet, its fix clears the day, and Undo puts the day back"
  # The reason is at the top of Playwright's report, not in its last lines.
  grep -E -A12 "Error:|›" "$log" | sed 's/^/        /' | head -40
  failed=$((failed + 1))
fi

# The wizard is read from the checkout, not the container: the app image carries
# only the built front end. Onboarding speed is the point of the wizard, so it
# may not grow a screen or a field without someone lowering these on purpose.
# 4 and 8 since a cloud trial's admin chooses a password first (#247); others still see 3.
WIZARD=src/pages/SetupWizard.tsx
MAX_SCREENS=4
MAX_FIELDS=8
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
