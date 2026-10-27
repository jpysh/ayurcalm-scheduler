# 50 things that go wrong — expected, and what happened

Status: **Walked** = done by taps in this audit (shots in `walk/`); **Test** = an existing server or browser test already asserts it (name in brief); **Gap** = neither, or the app has no way to do it. Refreshed 27 Oct: the eight gaps re-walked; five handled, two filed (#1297, #1298), one not for launch. Findings are the ids in `findings-raw.md`.

| # | Scenario | Expected | Status | Result |
|---|---|---|---|---|
| 1 | Her own therapist on leave in week 2 | Leave saved; her treatments offered another therapist; pill names it | Walked + Test (own therapist on leave) | Works, but the leave sheet opened on another day saves for today (UX-7); the pill shows today's leave on other days (BUG-5) |
| 2 | Her treatment room out of use | Moved to a free room, Undo offered | Walked + Test | "Hanuman out of use all day · 1 moved · Undo" |
| 3 | Centre holiday mid-course | Treatments moved to the next open day in one pass; what cannot move waits in the pill | Walked + Test | 6 moved, 1 waiting; Plan next week blocks a whole line on a closed day (BUG-4) |
| 4 | Doctor off on her review day | Review offered another doctor or day | Test (therapist absent moves day) | Not walked for a doctor specifically |
| 5 | Leaves 3 days early | Stay shortened; meals stop; cost recalculated; later treatments cancelled | Walked + Test | Sheet says 3 days shorter, meals stop, new cost |
| 6 | Double booking attempted | Warned, "Book anyway" possible | Walked + Test | "Devi already has Consultation at 10:00. Booking it is still possible." |
| 7 | Arrives a day late | Stay start moved; day 1 treatments moved or cancelled | Test (guest who never arrives) | Late arrival not walked |
| 8 | One no-show | Marked, room and therapist freed, Undo | Walked + Test | Works; discharge prints the day as "Rest" (COPY-2) |
| 9 | 40 minutes late | Suggested time later than now | Walked | Future day suggests 105 min earlier (VERIFY-2) |
| 10 | Extends 4 days | Stay longer, room checked for the extra nights | Test (room re-checked when dates change) | |
| 11 | Therapy deleted mid-course | Coming treatments go, done ones stay | Test | |
| 12 | Therapy length changed | Admin told what happens to booked sessions | Walked | Silent; booked keep old length (DECIDE-1) |
| 13 | Two therapists needed, one free | Refused, never short-handed | Test | |
| 14 | No woman therapist free | Refused with next free time | Test (gender) | |
| 15 | Guest room full on change night | Refused, free rooms named | Test | |
| 16 | Couple shares room | Two beds, one room | Test | |
| 17 | Doctor changes diet for tomorrow only | Only that day changes | Test (meals by date) | |
| 18 | Diet plan edited for all, her override survives | Override kept | Test | |
| 19 | Food limit removed | Kitchen sheet drops it | Test (food limit prints) | Removal itself not asserted |
| 20 | Book all fails partway | Nothing half-booked | Test | |
| 21 | Undo after three later changes | Undo of that batch only | Test (Log undo newest) | Older-than-newest undo not offered by design |
| 22 | Print, change, reprint | One copy kept, replaced | Test | |
| 23 | Timezone changed mid-stay | Today follows the centre | Test (machine date never read) | Mid-stay change not walked |
| 24 | Hours shrink | Out-of-hours treatments flagged | Gap → #1297 | Walked 27 Oct: closing moved 20:00 to 17:00; 18:00 and 18:30 treatments still listed, but neither the save nor the day check says they are after closing |
| 25 | Staff account tries admin action | 403, data unchanged | Test | |
| 26 | Sign-in expires mid-form | Told why; typing kept | Walked | Silent jump to sign-in, typing lost (UX-9) |
| 27 | Offline or slow save | Nothing saved, said plainly, retry works | Walked | "No signal, so nothing was saved." |
| 28 | Bad input | Limits shown, why a button is grey | Walked + Test | 80-letter cap shown; inverted dates grey the button silently (UX-8) |
| 29 | Discharged with bookings ahead | Later treatments cancelled with reason | Test | |
| 30 | Summary incomplete, then final; link closes | Prints blanks; final closes link | Walked + Test | Prints with blanks; one page |
| 31 | Snehapana ghee dose rises daily | Meals day by day | Handled (#1082) | A diet plan has day-by-day steps; the plan says the dose is the physician's each morning, and a one-day meal edit records it |
| 32 | Virechana day: no other treatment, rest-day diet | Course diet dated from Virechana | Test (course to three diets) | |
| 33 | Samsarjana steps advance by day | Day-by-day gruel | Handled (#1082) | Read 27 Oct: After purification plan carries a six-step ladder, two days a rung; the kitchen serves the day's step (dietResolution test) |
| 34 | Menstruation pauses 3 days, course extended | Days skipped, course pushed | Handled (#1232) | Pause treatments: drop those days, or push the rest later; one Undo |
| 35 | Fever: no oil treatments 2 days | Those cancelled, others kept | Handled (#1232) | Pause drops every treatment those days; keeping a non-oil one is one rebook |
| 36 | Vasti order broken by a missed day | Order kept | Gap → #1298 | Anuvasana and Kashaya Vasti are separate once-per-course therapies; nothing keeps their order |
| 37 | Oil runs out, therapy swapped | Swap on the card | Walked (swap in Plan next week) | |
| 38 | Paired abhyanga, one partner sick | Second therapist found or refused | Test (pair lost one therapist) | |
| 39 | Same therapist all 21 days, weekly off | First choice, other on their off day | Test (own therapist first) | |
| 40 | Power cut: dhara room unusable | Room out of use, moved | Walked (scenario 2) | |
| 41 | Ekadashi fasting day | Kitchen changes that day | Not for launch | A centre-wide fast is the kitchen's calendar; a programme event names the day and per-guest meals cover exceptions |
| 42 | Male therapist asked, gender rule switched off | Switch in Settings | Test (gender respects switch) | |
| 43 | Family visitor wants a treatment | Day patient booked | Test (new patient, day patient) | |
| 44 | Two arrive wanting 07:00 | Second offered next time | Test (day full says when) | |
| 45 | Weak after purification: later times | Move later | Walked (When sheet) | |
| 46 | New contraindication (no head oil) | Recorded and shown when booking | Handled (#1281) | Not for them: a ruled-out therapy is refused by the guard with the reason |
| 47 | Ghee intolerance found on day 5 | Food limit added, kitchen told | Walked (Food limits row) | Text only |
| 48 | Room AC fails, moved house | Guest room changed for nights left | Test (move action) | |
| 49 | Therapist leaves for good | Deleting takes coming treatments | Test | Should move, not just take them: not checked |
| 50 | Discharge day | Final consult, summary, room to make up | Walked + rooms sheet | Summary prints; take-home medicine field not seen |
