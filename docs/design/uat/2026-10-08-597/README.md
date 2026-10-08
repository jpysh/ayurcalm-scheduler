# UAT 2026-10-08-597

Base http://localhost:8160, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | A full-day leave for 2026-10-14 is saved on that day, phone in America/New_York | pass | sent 2026-10-14T00:00:00.000Z to 2026-10-14T00:00:00.000Z, wanted 2026-10-14 | ![01](01.png) |
| 02 | A full-day leave for 2026-10-14 is saved on that day, phone in Pacific/Auckland | pass | sent 2026-10-14T00:00:00.000Z to 2026-10-14T00:00:00.000Z, wanted 2026-10-14 | ![02](02.png) |
| 03 | A full-day leave for 2026-10-14 is saved on that day, phone in Asia/Kolkata | pass | sent 2026-10-14T00:00:00.000Z to 2026-10-14T00:00:00.000Z, wanted 2026-10-14 | ![03](03.png) |
