# Therapies and the day: real-life situations (27 Oct 2026)

**120 situations: 110 handled, 4 gaps (on open issues), 6 not for launch (rare; reason given), 0 unknown.** Out-of-scope items are listed at the end, not counted.
The strong parts: the guard (therapist, room, guest, gender, amenities, co-therapists, leave, events, holidays, closed weekdays), one-pass re-planning with Undo, the printed day sheet.
The gaps: shortened centre hours are not flagged (#1297), Vasti course order (#1298), room turnover time (#1303), deleting a room through the API (#1304).

What this is: the situations a residential Ayurveda centre like Babaji (Ranikhet; 15 treatment rooms, about 18 therapists and doctors, 40 to 60 treatments a day, Panchakarma of 3 to 45 days, day visitors) meets with therapies and the daily schedule, and how the app copes today. The companion to `2026-10-26-stay-room-situations.md`; stays, guest rooms, Form C and the kitchen are there, not here. It absorbs the therapy rows of `2026-10-22-prelaunch/scenarios.md`.

How "today in the app" was judged: **walked** = on a throwaway stack on 27 Oct (`walktherapy`, :8397, seeded centre), through the API and, for the day list, a 375 px screenshot; **test** = a server test asserts it (file in `server/src/tests/`); **read** = the code or a merged PR settles it. Priority: High = will happen in the first month at Babaji; Med = will happen in a season; Low = rare.

## Booking one treatment

| # | Situation | Best-in-class handling for a phone-only admin | Today in the app | Priority |
|---|---|---|---|---|
| 1 | Book a treatment for a resident | Pick therapy; free times with therapist and room offered | Handled (bookingRules, availability tests; suggest and options endpoints) | High |
| 2 | Therapist already busy at that time | Refused with the next free time | Handled (walked: STAFF_BUSY "already has a treatment at 09:00", offers "Book at 12:00") | High |
| 3 | Room already busy | Refused, another room offered | Handled (ROOM_BUSY; scheduleInvariants test) | High |
| 4 | Guest already has a treatment then | Refused | Handled (PATIENT_BUSY) | High |
| 5 | Room lacks what the therapy needs (Shirodhara stand, steam) | Only fitting rooms offered | Handled (AMENITIES_MISSING; walked: Shirodhara offered 7 of 15 rooms) | High |
| 6 | Guest not staying that day | Refused with their stay dates | Handled (walked: NOT_STAYING) | High |
| 7 | Double tap on Book | One treatment | Handled (walked: second identical booking refused, STAFF_BUSY) | High |
| 8 | Same therapy twice the same day | Asked, "Book anyway" | Handled (SAME_THERAPY, confirm) | Med |
| 9 | More than the daily limit for one guest | Asked, "Book anyway" | Handled (DAY_FULL, Settings max per day; dayFull test) | Med |
| 10 | Therapy switched off | Not offered | Handled (THERAPY_OFF) | Low |
| 11 | Therapist not trained in the therapy | Not offered | Handled (specialisations; availability test) | High |
| 12 | Treatment would run past the therapist's hours | Refused, hours named | Handled (walked: 19:00 Shirodhara refused "works 09:00 to 20:00") | High |
| 13 | Treatment booked for a day already past (catch-up record) | Allowed, plainly recorded | Not for launch: walked, books silently; recording yesterday's treatment is a real need | Low |
| 14 | Booking from the guest's card | Book from the card, their day shown | Handled (patient day endpoint, treatmentCard test) | High |
| 15 | Who is free at 15:00 now | List of free therapists | Handled (staff-day; teamPartDay test) | High |

## Courses and sessions

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 16 | 14-day Panchakarma booked at arrival | Course booked in one go, each day planned | Handled (starter courses, Plan next week; starters, nextWeek tests) | High |
| 17 | Next week not booked after the review | Reminder | Handled (next_week rule) | High |
| 18 | Same therapist for the whole course | Their therapist first | Handled (ownTherapist test) | High |
| 19 | Own therapist's weekly off day | Another therapist that day, own one back next | Handled (ownTherapist, offDays tests) | High |
| 20 | Doctor swaps a therapy mid-course | Coming sessions swapped from a date | Handled (Plan next week swap, one batch) | High |
| 21 | Therapy length changed with sessions booked | Admin told; booked ones follow or stay | Handled (therapyLength test) | Med |
| 22 | Therapy deleted mid-course | Coming sessions go, done ones stay | Handled (deleteKeepsDone test) | Low |
| 23 | "Session 3 of 7" on the sheet | Count printed | Not for launch: the change log says "Booked: session N"; the sheet is clear without it | Low |
| 24 | Course needs the same room each day | Same room preferred | Not for launch: any fitting room serves; therapists move, guests are walked there | Low |
| 25 | Guest skips a day of the course | Day dropped or course pushed | Handled (#1232 pause: drop or push) | High |
| 26 | Course runs past the stay end | Refused or stay extended | Handled (STAY_TOO_SHORT; stays audit #20) | Med |

## Co-therapists and pairs

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 27 | Abhyanga needs two therapists | Two booked together, never short-handed | Handled (walked: STAFF_SHORT "needs 2 therapists together"; coTherapist test) | High |
| 28 | One of the pair falls sick | Second found or treatment flagged | Handled (coTherapist test: pair lost one therapist) | High |
| 29 | Pair must both be the guest's gender | Both matched | Handled (walked: "needs 2 therapists together (men)") | High |
| 30 | Co-therapist on another treatment then | Refused for both | Handled (coTherapist test) | High |
| 31 | Day sheet names both therapists | "Ravi Gupta & Kiran Mishra" | Handled (walked: sheet prints both) | High |

## Gender match

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 32 | Woman guest, only men free | Refused with next time a woman is free | Handled (GENDER_MISMATCH; test) | High |
| 33 | Therapy without gender rule (Shirodhara) | Any therapist | Handled (requires_gender_match per therapy) | High |
| 34 | Centre switches the rule off | Setting honoured | Handled (gender respects switch test) | Low |
| 35 | Guest asks for a specific gender against the rule | Admin overrides | Handled (choose the therapist by hand) | Med |

## Treatment rooms and amenities

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 36 | Room out of use for a day (leak, power) | Treatments moved in one pass, Undo | Handled (#1247; roomOut test) | High |
| 37 | Room's weekly hours shorter than the centre's | Not booked outside them | Handled (room weekly schedule in the guard) | Med |
| 38 | Oil room needs cleaning between guests | Turnover minutes kept free | Gap → #1303 | Med |
| 39 | Steam unit broken; Swedana rooms down | Those rooms out of use | Handled (per-room out of use) | Med |
| 40 | Consultation room holds consultations only | Doctor's room kept for them | Handled (decision 2026-10-24 one room holds consultations) | Med |
| 41 | Room deleted with treatments ahead | Moved, never dropped | Gap → #1304 (no screen deletes; the API drops them) | Low |
| 42 | New room added mid-season | Offered from then | Handled (rooms POST; free from its hours) | Low |

## Leave and staff hours

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 43 | Therapist sick this morning | Leave from now, day re-planned in one pass | Handled (day check, replan; dayPlan test) | High |
| 44 | Leave for part of a day | Only those hours moved | Handled (teamPartDay test) | High |
| 45 | Leave entered twice | No double move | Handled (leaveTwice test) | Med |
| 46 | Festival leave for a week | Coming days flagged | Handled (day-check range and upcoming) | High |
| 47 | Weekly hours changed with bookings outside them | Told before saving | Handled (#380 hours-check) | Med |
| 48 | Split shift (07–11, 16–20) | Both parts bookable | Handled (therapistRota test) | Med |
| 49 | Therapist quits | Treatments handed over | Handled (decision delete hands over) | Med |
| 50 | New therapist joins | Free from their hours | Handled | Med |
| 51 | Doctor away on review day | Review offered another doctor | Handled (doctors test) | Med |
| 52 | One therapist given 9 treatments in a day | Load warning | Not for launch: hours already cap it; the staff week shows each one's count | Low |
| 53 | Leave entered: what it moves | Shown before saving | Handled (timeoff impact endpoint) | Med |

## Events and programme

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 54 | Therapist leads yoga 07:00 | Not booked then | Handled (STAFF_IN_EVENT) | High |
| 55 | Treatment runs through a required programme part | Noted | Handled (EVENT_OVERLAP in the day check, a note) | Med |
| 56 | Group's own programme | Prints on each guest's row | Handled (#1267) | Med |
| 57 | Everyone's events on the sheet | One line "For everyone" | Handled (walked: printed sheet top line) | High |
| 58 | Recurring weekly event | Weekly with weekdays | Handled (program events recurrence) | Med |
| 59 | Event changed after treatments booked | Clashes flagged | Handled (day check reads events each time) | Med |

## Panchakarma sequences and medical limits

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 60 | Snehapana must come before Virechana | Out-of-order booking asked about | Handled (AFTER_PURIFICATION with "Book the day before instead") | High |
| 61 | Virechana once per course | Second one asked about | Handled (ONCE_PER_COURSE) | High |
| 62 | Vamana / Virechana day free of other treatments | Refused | Handled (#1281 rest day) | High |
| 63 | Contraindicated therapy (pregnancy, BP) | Refused with reason | Handled (#1281 NOT_FOR_PATIENT) | High |
| 64 | Treatment before the arrival consultation | Noted | Handled (#1265, a note) | High |
| 65 | Menstruation: oil treatments paused 3 days | Pause, push course | Handled (#1232) | High |
| 66 | Fever: treatments stop 2 days | Pause | Handled (#1232) | High |
| 67 | Vasti course order (Anuvasana, Kashaya) | Order kept through a pause | Gap → #1298 | Med |
| 68 | Diet follows the purification | Oleation, then after-purification steps | Handled (courseDiet test, #1082 steps) | High |
| 69 | Snehapana dose rises daily | Day's dose on the sheet | Handled (#1082 steps; sheet says "Confirm today's dose") | Med |
| 70 | Consultation never refused by limits | Doctor can always see them | Handled (treatmentLimits test) | High |
| 71 | Vitals before treatment | Reminder | Handled (vitals rule) | Med |
| 72 | Treatment checklist (oil ready, room prepared) | Per therapy | Handled (therapy checklist) | Low |

## Consultations

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 73 | Arrival consultation | Booked first | Handled (#1265, beforeConsultation test) | High |
| 74 | Doctor's review due | Reminder | Handled (review_due rule) | High |
| 75 | After a consult, update plan | Asked "Update their diet or treatments?" | Handled (walked: CONSULTED in the day check) | High |
| 76 | Next free consultation | Answer in one tap | Handled (consultations/next) | Med |
| 77 | Outpatient consultation only | Day patient, consult only | Handled (newPatient test: day patient) | Med |

## Day sheet and the day screen

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 78 | Morning sheet for therapists | Per guest, time, therapy, therapist, room | Handled (walked: `pdftotext` 27 Oct, 5 pages) | High |
| 79 | Problem treatments marked on paper | "NO THERAPIST" printed | Handled (walked: "NO THERAPIST · Bhavna Mishra (off)") | High |
| 80 | Diet and food limits on the sheet | By plan, limits named | Handled (walked) | High |
| 81 | Reprint after a change | Copy replaced, kept per day | Handled (printedSheets test) | High |
| 82 | Day on the phone, regrouped by therapist or room | List only sorts | Handled (DayList; walked at 375 px with closing at 17:00, 18:30 rows still listed: `2026-10-27-therapy-day/day-after-closing-375.png`) | High |
| 83 | Day with no therapist names yet | Sheet still prints | Handled (unstaffedSheets test) | Med |
| 84 | What is wrong today, in one list | Day check | Handled (dayCheckParity test) | High |
| 85 | Fix all in one pass, Undo | Plan once, Undo exact | Handled (dayPlan test) | High |
| 86 | Admin pins one row, the rest planned around | Pin kept | Handled (dayPlan test) | Med |
| 87 | Why the app chose that therapist | Reason shown | Handled (planWhy test) | Low |
| 88 | Treatment history | Who booked, moved, when | Handled (appointment history) | Med |

## Therapist links

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 89 | Therapist sees own day on their phone | Link, no sign-in | Handled (links test) | High |
| 90 | Therapist flags a problem (oil finished, guest unwell, SOS) | In the day check at once | Handled (links test: SOS and missing supply listed) | Med |
| 91 | Link shared by mistake | New link, old one dead | Handled (link renew makes a new token) | Low |
| 92 | Guest sees their own day | Guest link | Handled (patient link) | Med |

## No-shows, cancellations, lateness

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 93 | Guest does not come to a treatment | No-show; therapist and room freed | Handled (walked: no_show then the same slot booked again) | High |
| 94 | Guest cancels one treatment | Cancelled, slot freed | Handled (walked: cancelled then rebooked) | High |
| 95 | Guest 40 minutes late | Moved later today | Handled (When sheet; prelaunch #9) | High |
| 96 | Arrived hours late | Earlier treatments moved after arrival | Handled (#1247 arrived late today) | High |
| 97 | Guest never arrives | Treatments freed, Undo | Handled (didNotArrive test) | High |
| 98 | Cancel by mistake | Undo | Handled (change log undo) | Med |
| 99 | Two admins edit one treatment | Second save refused | Handled (walked: stale edit refused CHANGED_SINCE) | High |
| 100 | Treatment runs over by 20 minutes | Next one told | Not for launch: the therapist adjusts on the floor | Low |

## Outpatients and day visitors

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 101 | Local walk-in for Abhyanga | New guest, day stay, booked | Handled (newPatient test) | High |
| 102 | Family visitor wants one treatment | Day patient | Handled (prelaunch #43) | Med |
| 103 | Day patient comes three days a week | Treatments on those days | Handled (off-site stay with treatments) | Med |
| 104 | Outpatient reminders by SMS | Message the day before | Not for launch: guest link and phone; messaging is outside the app | Low |

## Out of hours, closed days, holidays

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 105 | Centre holiday (Diwali) | Treatments moved in one pass | Handled (CENTER_HOLIDAY, move-closed; closeDay test) | High |
| 106 | Weekly closed day (Thursday) | Refused; booked ones flagged | Handled (walked: refused "closed on Thursdays"; day check lists 6 booked, 5 movable) | Med |
| 107 | Centre hours shortened | Booked treatments outside flagged | Gap → #1297 (walked: 11 after 17:00 tomorrow, none flagged) | Med |
| 108 | Booking before opening | Refused | Handled (guard reads opening time and staff hours) | Med |
| 109 | India holidays offered | List to pick from | Handled (holidays/india) | Low |
| 110 | Evening treatment for an evening visitor | Hours from Settings | Handled (buildTimeSlots; seeded leave to 18:00, #369) | Med |
| 111 | Guest has no treatments for some hours (outing) | Not booked then | Handled (PATIENT_OFF) | Med |

## Clock and time zone

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 112 | "Today" at 23:55 | Centre's day | Handled (centreDay, seedClock tests) | High |
| 113 | Admin abroad | Centre's zone | Handled (#1197) | Med |
| 114 | Past times today not flagged | Day check skips what is over | Handled (walked 23:30: past treatments not listed) | Med |
| 115 | Phone clock wrong | Server decides | Handled | Med |
| 116 | Time zone changed mid-stay | Today follows | Handled (machine date never read test) | Low |

## Records and setup

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 117 | Add therapies from a library | Pick, edit | Handled (therapyLibrary test) | High |
| 118 | Import therapies | Check then import | Handled (therapies import) | Med |
| 119 | Every change in plain words | Change log | Handled (changeLog test) | Med |
| 120 | Treatment records for a guest | Records PDF | Handled (records-pdf) | Med |

## Out of scope (settled in #53)

Payments, packages priced per session, therapist commission and payroll, oil and medicine stock, GST billing, online self-booking, marketing.
