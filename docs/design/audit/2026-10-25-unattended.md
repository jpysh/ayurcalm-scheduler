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
