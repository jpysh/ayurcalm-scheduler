# UAT 2026-10-08-586

Base http://localhost:8157, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | A new leave starts on tomorrow, after closing (21:30) | pass | From reads Sat 10 Oct, expected Sat 10 Oct | ![01](01.png) |
| 02 | One day's meals open on tomorrow, after closing (21:30) | pass | Day reads Sat 10 Oct, expected Sat 10 Oct | ![02](02.png) |
| 03 | A new leave starts on today, before closing (10:00) | pass | From reads Fri 9 Oct, expected Fri 9 Oct | ![03](03.png) |
| 04 | One day's meals open on today, before closing (10:00) | pass | Day reads Fri 9 Oct, expected Fri 9 Oct | ![04](04.png) |
