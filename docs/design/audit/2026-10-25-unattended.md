# Unattended session, 25 Oct 2026

One session, one PR open at a time, each from a fresh branch off `main`.

## Pull requests

| PR | What | Status |
|---|---|---|
| #1148 | Get started keeps an OPD room apart from the treatment rooms (#1147); #1144 undone, its decision superseded | merged |
| #1149 | Discharge summary: a grid row grows to its tallest cell, an 80-letter name prints whole (#1137) | merged |
| #1153 | Page header: Back keeps its width at 200% text (#1150) | merged |
| #1154 | Log: a long word breaks inside the card at 200% text (#1151) | merged |
| #1155 | Day headline names only the named room's residents (#1152) | merged |
| this | This note | auto-merge |

#1149's `full` failed twice on the kitchen and stay tests: the discharge test renamed its patient out of reach of its own tidy-up, leaving a 2030 stay behind. Fixed in the same PR (one strike).

## Clean-up

Removed 15 worktrees merged into `main`. Kept `night-c` (an uncommitted UAT folder) and `mattpocock-skills-grill-review` (changed `site/.wrangler` files): both dirty.

## Walk (seed-hidden state)

On a throwaway stack. Held: the centre's midnight in Asia/Kolkata crossed live with phones in Kolkata and New York (the day moves to the 26th, the now-line at 00:01); a New York centre read from a phone in India shows New York's day; a stay shortened to end today (cancelled after, gone from tomorrow's sheets, "leaves today" on guest rooms, in the day's Leaving line).

Found, filed `walk-found`:
- #1150 cut text: at 200% text '‹ Day' runs over the title on four screens. Fixed.
- #1151 cut text: at 200% text a long therapy name runs past the Log card. Fixed.
- #1152 text-vs-server: with many rooms out of use the headline names one room and every room's residents. Fixed.

Guards: cut text at 200% is the nightly `textCut.spec.ts` (Log added); the headline is in `dayCheckParity` (runs in `qa`).

## For the maintainer

- **The nightly browser tests are switched off** (GitHub Actions, "Nightly browser tests", disabled by hand; last run 6 Oct). `textCut` would have caught #1150; it also reports the day's count line '68 treatments · 15 r…' under the hour heading at 200%, not looked into. Turn it back on? (Actions tab, the workflow, "Enable workflow".)

## Second session (evening)

The nightly was switched back on and ran once (25 Oct, 52 failing), filing #1166.

| PR | What | Status |
|---|---|---|
| #1161 | Day: at 200% text the count line wraps and the hour headings stick under it (#1160); the cut-text check now catches words spilling out of a sticky bar | merged |
| #1165 | Doctor rota: the only doctor on leave reads "NO DOCTOR", not "NO THERAPIST" (#1163) | merged |
| #1167 | Test repair: 16 tests follow screens that moved while the nightly was off (O1 deleted, its filter gone since #698); nightly sets RATE_LIMIT_CALLS=10000 | auto-merge |
| #1168 | Get started: a doctor is not counted as a therapist (#1162) | auto-merge |
| this | This note | auto-merge |

**Nightly issue #1166:** open. 16 failures reproduced on a fresh seed, all wrong tests (#1167). About 36 more failed only on CI; its log has 429s and the workflow lacked RATE_LIMIT_CALLS, so they are expected to clear. The next run (21:30 UTC) closes the issue if green; any left are real.

## Walk (new charter)

Trial centre from sign-up, example cleared, one doctor and no therapist; the only doctor on leave; a guest moved between guest rooms mid-stay.

- #1162 text-vs-server: Get started counted the doctor as a therapist. Fixed, guard U1b.
- #1163 wording: the doctor rota said "therapist". Fixed, guard in `test:rota`.
- #1164 text-vs-server: moving a guest to a room free from tonight is refused because of a guest who left last week; a stay has one room for every night. Not fixed: needs the stay's room to change from a date. Its own session.

Held: the day says "Full from 09:00: no therapist is in"; the doctor's leave moves the booked consultation to the next free day and the next-consultation offer skips the day.

## For the maintainer

Nothing needed. #1164 is a design change for the next session.
