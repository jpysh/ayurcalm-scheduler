# Demo seed: purification notes only where a purification is current (#403)

Lite seed, 7 Oct. The patient day sheet read with `pdftotext -layout` (before-sheet.txt is main after #401, after-sheet.txt this branch).

| # | Check | Result |
|---|---|---|
| 01 | Before: Arjun Reddy (day 18 of 18, no purification booked) under "General sattvic plan — changed for today" with "Rice gruel only — post-Virechana" | baseline |
| 02 | Before: Ishita Das and Arjun carry "Set each morning by the physician through the purification" with nothing to purify | baseline |
| 03 | After: the gruel is Meera Khan's, under "After purification (samsarjana krama) — changed for today", with her 09:00 Virechana on the same row | pass |
| 04 | After: the purification note is only on Ishita Banerjee and Sai Singh, whose Virechana is ahead | pass |
| 05 | After: the seeded no-show is Ishita Das's Gandusha, not a Virechana; still 3 problems, all Ravi's | pass |
