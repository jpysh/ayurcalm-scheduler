# UAT 2026-10-08-601

Base http://localhost:8162, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | Today's leave is Upcoming and yesterday's is Past, phone in America/New_York | pass | Upcoming has today's: true, yesterday's: false; Past has today's: false, yesterday's: true | ![01](01.png) |
| 02 | Today's leave is Upcoming and yesterday's is Past, phone in Pacific/Auckland | pass | Upcoming has today's: true, yesterday's: false; Past has today's: false, yesterday's: true | ![02](02.png) |
| 03 | Today's leave is Upcoming and yesterday's is Past, phone in Asia/Kolkata | pass | Upcoming has today's: true, yesterday's: false; Past has today's: false, yesterday's: true | ![03](03.png) |
