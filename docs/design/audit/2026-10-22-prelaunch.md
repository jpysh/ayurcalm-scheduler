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
| Card of a guest arriving later shows no diet and none of their booked treatments | #1068 | open, fix next |
| Plan next week at the first review ignores treatments already booked | #1069 | open |
| One closed day switches a whole Plan next week line off | #1070 | open |
| What needs you on another day lists today's leave and patients | #1071 | open |
| Leave and close-day sheets start on today, not the day on screen | #1072 | open |
| An expired sign-in throws away what was typed | #1073 | open |
| A closed day offers a move to after the guest has left | #1075 | open |
| Polish: the day, What needs you, list screens | #1076 | open, polish-batch |
| Polish: the patient card and its sheets | #1077 | open, polish-batch |
| Polish: Settings, catalogues, Availability | #1078 | open, polish-batch |
| Booked sessions and a therapy's new length | #1079 | question for the maintainer |
| A therapist leaving for good | #1080 | question for the maintainer |
| Steam right after massage | #1081 | question for the maintainer |
| Per-day steps inside a diet plan | #1082 | question for the maintainer |

Not filed yet, to check by hand first: a late patient's "Suggested" time on today (on a future day it suggests earlier), and one swapped line that came out switched off in Plan next week. Tap count unchanged except "Warning → fixed day", which broke twice: nightly, for the weekly test repair.

## For the maintainer

Four one-line questions: #1079, #1080, #1081, #1082. Nothing else needs you.
