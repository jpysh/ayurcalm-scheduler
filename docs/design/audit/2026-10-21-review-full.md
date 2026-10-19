# Full review on the admin's phone, 21 Oct

After #979–#987 and #1012–#1021. Two throwaway stacks: the seeded demo centre and a new centre
cleared to nothing. 38 shots at 375x812 from `scripts/uat-review-full.mjs`, in
[../uat/2026-10-21-review-full/](../uat/2026-10-21-review-full/) (taps per step in `taps.txt`); the
four printed sheets read with `pdftotext -layout`.

## What works

- **Get started** (01, 08): four rows, the next one bold, ticks as each is done. The common
  therapies are one tap from the row (02–03, #1020); a room and a therapist are one form each.
- **Starter week** (11–12): starters built from the centre's own therapies (#1015) with counts.
- **The day** (14–16): now-line, by time / by therapist, "Bhavna not in" on the row, the card's change lines.
- **Full from** (17–18): "Full from 12:00" on the week and in the booking sheet (#979, #1014).
- **Booking** (19–22): 4 taps, target 4; Booked confirms in the sheet with Undo.
- **Therapist out and the plan** (23–25): "7 treatments that day will need another therapist"
  before Save; the plan says 4 move, 3 wait, and why in one line (#987).
- **Part-day closure** (26): Part of a day, with how many are booked then (#985).
- **Meals until leaving** (29) and **purification course diets** (30): "Follow the course" names
  every step and date (#982, #986).
- **SOS vs unwell** (33, 37): only the SOS is red (#1012).
- **Doctor round** (34–35): reviews due, the round, last note, readings, plan.
- **Sheets**: day, therapist rota, doctor rota and kitchen all print; "NO THERAPIST" marks the
  rows still on the therapist on leave; the kitchen counts match 40 staying.

## Findings, ranked

| # | Finding | Shot | Kind |
|---|---------|------|------|
| #1022 | A new centre is offered starters it cannot give; Book all answers with a 13-line note | 13 | bug, question |
| #1023 | "Full from 09:00: no therapist has a free hour" when the therapist is free (the room has no equipment) | 07 | bug, question |
| #1028 | "Same as last time" offers a therapy already booked that day | 21 | question |
| #1029 | A one-therapist centre is told "Too few therapists in" | 07 | question |
| #1030 | The print note carries five sheet buttons, against the one-action toast | 38 | question |
| #1024 | Patient-added toast has two actions | 10 | question (#935 put it there) |
| #1025 | Doctor's round readings show raw dates | 35 | polish |
| #1026 | SOS line has a double colon | 37 | polish |
| #1027 | Rooms list says "room" under every room | 05 | polish |

## Taps against `tapCount.spec.ts`

Book one treatment 4 (target 4). Therapist not in 3 (3). A patient's meals 3 from Patients (3).
Record a therapist's leave 7 with "Some days" (6 with "Save, fix later"). New centre's therapies
2 (the row, Add 15). Plan a new guest's week 4 (card, Plan next week, a starter, Book all; target 3
without a starter). Part-day closure 5 from the day (Menu, Availability, Centre closed days,
Close another day, Part of a day): no target yet.

## Skipped

Guest rooms sheet (fifth sheet), 200% text, another time zone.
