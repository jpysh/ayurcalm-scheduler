# UAT 2026-10-08-597-before

Base http://localhost:8140, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | A full-day leave for 2026-10-14 is saved on that day, phone in America/New_York | FAIL | sent 2026-10-13T13:00:00.000Z to 2026-10-13T22:00:00.000Z, wanted 2026-10-14 | ![01](01.png) |
| 02 | A full-day leave for 2026-10-14 is saved on that day, phone in Pacific/Auckland | FAIL | sent 2026-10-13T20:00:00.000Z to 2026-10-14T05:00:00.000Z, wanted 2026-10-14 | ![02](02.png) |
| 03 | A full-day leave for 2026-10-14 is saved on that day, phone in Asia/Kolkata | pass | sent 2026-10-14T03:30:00.000Z to 2026-10-14T12:30:00.000Z, wanted 2026-10-14 | ![03](03.png) |
