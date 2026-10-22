# Week simulation, 22 Oct 2026

After #1022, #1023, #1024, #1028, #1029 and #1030 merged. A throwaway stack (`weeksim`, port 8099), seeded demo centre.
`node scripts/week-sim.mjs 20261021` ran seven centre days (Fri 23 to Thu 29 Oct, Asia/Kolkata) through the API only:
12 new residents (2 with "only their own therapist"), 1–3 courses each, 2 therapists on leave 25–26 Oct,
the centre closed on Mon 26 Oct with "move", 2 stays shortened, 3 cancellations and 3 moves. Shots are from `scripts/uat-week-sim.mjs` at 375x812.

## What held

- No therapist, room or resident was double-booked on any day. Leave held: nothing was put on a therapist who was away.
- The closed day: what could not move (most were on the resident's leaving day, or for a resident only one therapist may treat) stayed and was flagged, 13 of 13. The toast says "Nothing could be moved. 13 wait under need you" (`day-10-26`).
- #1030: Print opens one sheet with the problems line, Fix first, Print all sheets and five single sheets (`print-sheet-26`). Print all gave one PDF a day (10–15 pages). The closed day prints "NOT FIXED WHEN PRINTED: The centre is closed…" on the sheet itself.
- #1028: Plan next week marks a therapy already booked ("Already booked next week") and leaves it unticked (`starters-anya-h`).
- #1022, #1023, #1024, #1029 change new-centre screens (a centre with one therapist and one room). The seeded centre in this simulation does not show them. Each was checked by its own PR's shots in `docs/design/uat/2026-10-21-*`.

## Findings

| Finding | Issue | Fix | Status |
|---|---|---|---|
| Booking a course ignores "only treated by their own therapist": 11 of Sim Anya G's 12 treatments went to other therapists, and /day-check said nothing | #1043 | #1046: the course scheduler books only their own therapist | auto-merge on; #1043 stays open for the question below |
| Treatments kept after a stay is shortened stay on the day list and the printed sheets, and nothing flags them | #1044 | #1047: /day-check flags NOT_STAYING ("Cancel it, or change their stay"); shows on the printed sheet too | auto-merge on |
| A closed day where nothing can move still offers a Move button that moves nothing | #1048 | #1049: the day check counts what can move; with none, the card says so and offers no button | auto-merge on |

## For the maintainer

- #1043, one question: may a hand-picked booking ("Book a treatment") still put such a resident with another therapist, or should it be refused?
