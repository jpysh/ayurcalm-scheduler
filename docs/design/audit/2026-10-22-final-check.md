# Final whole-app check, 22–23 Oct 2026

After the pre-launch audit's fixes all merged (main at #1122). Fresh throwaway stack `applane` on :8120, seeded from empty. Evidence in [2026-10-22-final-check/](2026-10-22-final-check/): `crawl/` (every Menu screen, scroll and sheet at 375x812, `inventory.tsv`) and `week-sim-20261023.txt`.

## What held

- Smoke browser tests: 10/10 on the fresh stack.
- Crawl (`scripts/uat-prelaunch-crawl.mjs`): 304 rows, 0 console errors. The 18 failed taps are the crawler reaching for buttons under an open sheet; each one tapped by hand works.
- Week simulation, seed 20261023: 11 "problems" in its own audit, none real. The closed day's 3 treatments and the early leavers' later ones are all flagged by the day check (CENTER_HOLIDAY, NOT_STAYING) and wait under What needs you; the "one-therapist rule" check is stale since #1043.
- `npm run qa`: 66/66 after the seed fix below.

## Findings

| Finding | Issue | Status |
|---|---|---|
| Opened at `/`, every address carried the sign-in email (`/admin@example.com/team`) | #1123 | fixed, #1125 |
| CI's seed check failed all of 23 Oct: the therapist off had no evening treatment | (blocked #1125) | fixed in #1125 |
| "the pill" still in What needs you's note and Settings row | #1124 | fixed, #1127 |
| Staff and Rooms rows said "Not available" | #1126 | fixed, #1128 |

The swapped Plan next week line from the pre-launch audit's hand checks did not appear in the crawl or the week; it was not reproduced by hand.

## For the maintainer

Nothing. No question from this check is yours.
