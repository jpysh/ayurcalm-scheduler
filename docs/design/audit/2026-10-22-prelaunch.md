# Pre-launch audit, 22 Oct 2026

After #1043 (#1050, #1051) and #1053 merged. Throwaway stack `review` on :8097, fresh volume. Evidence in [2026-10-22-prelaunch/](2026-10-22-prelaunch/): `walk/` (a 21-day test patient by taps, `walk.tsv`), `crawl/` (every Menu screen, scroll and sheet, `inventory.tsv`), [scenarios.md](2026-10-22-prelaunch/scenarios.md) (50 things that go wrong), [ux-review.md](2026-10-22-prelaunch/ux-review.md), [findings-raw.md](2026-10-22-prelaunch/findings-raw.md). Scripts: `scripts/uat-prelaunch-walk.mjs`, `scripts/uat-prelaunch-crawl.mjs`.

## What held

- Clean install: `docker compose up -d` on an empty volume came up healthy and seeded.
- Server rules: all 65 `npm run qa` checks pass (run alone; two suites on one stack collide). Smoke browser tests 10/10.
- Security: 549 GET route checks without a token, none answered; no response carries a password hash, reset token or key.
- Printed sheets (`pdftotext -layout`): all five print; kitchen counts add up; the seeded leave prints NOT FIXED. The discharge summary prints the whole course; the Hindi letterhead renders correctly.
- Docs: every file README, CONTRIBUTING, architecture.md and testing.md name exists.
- Week simulation, seed 20261022: its two real problems (a therapist booked on leave, treatments on a closed day) are flagged by the day check. Its "one-therapist rule" check is stale since #1043 made their own therapist a preference.
- The 21-day walk: admit (3 taps), four diet changes, a week booked, weekly reviews with swaps, a closed day (moved in one pass), no-show, late, room out of use, leave, a shorter stay, discharge, offline save: all done on a phone.

## Findings

| Finding | Issue | Status |
|---|---|---|
| Card of a guest arriving later shows no diet and none of their booked treatments | #1068 | fixed, #1096 |
| Plan next week at the first review ignores treatments already booked | #1069 | fixed, #1093 |
| One closed day switches a whole Plan next week line off | #1070 | fixed, #1103 |
| What needs you on another day lists today's leave and patients | #1071 | fixed, #1098 |
| Leave and close-day sheets start on today, not the day on screen | #1072 | fixed, #1098 |
| An expired sign-in throws away what was typed | #1073 | fixed, #1102 (reverted by accident, restored in #1113) |
| A closed day offers a move to after the guest has left | #1075 | fixed, #1092; its sheet wording #1106, #1107 |
| Polish: the day, What needs you, list screens | #1076 | done, #1118 |
| Polish: the patient card and its sheets | #1077 | done, #1111 and #1119 |
| Polish: Settings, catalogues, Availability | #1078 | done, #1120 |
| Booked sessions and a therapy's new length | #1079 | built, #1105 |
| A therapist leaving for good | #1080 | built, #1108 |
| Steam right after massage | #1081 | not planned: a centre makes a combined therapy in Therapies |
| Per-day steps inside a diet plan | #1082 | built, #1109 (server and sheets) and #1116 (editing in the app) |

The two "check by hand" items: the move sheet's first choice is now named "Best fit" and says how much earlier or later it is (#1118); the swapped line that came out switched off was not checked by hand; it goes to the final check.

## For the maintainer

All four questions were answered on 22 Oct and built (or closed, #1081). Nothing from this audit needs you.
