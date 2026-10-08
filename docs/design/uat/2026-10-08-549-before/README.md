# UAT 2026-10-08-549-before

Base http://localhost:8140, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | Leaving today: no details prompt, the question about the stay stays | FAIL | Your details · HOW WAS YOUR STAY? | ![01](01.png) |
| 02 | Already here: it says add the rest, not before you arrive | FAIL | 0 of 7 filled in. Please add them before you arrive. | ![02](02.png) |
| 03 | Arriving later: it still says before you arrive | pass | Your stay starts Saturday 10 October. · 0 of 7 filled in. Please add them before you arrive. | ![03](03.png) |
