# UAT 2026-10-08-599-before

Base http://localhost:8140, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | Change day to Sun 11 Oct shows that day, phone in Pacific/Auckland | FAIL | shows Sat 10 Oct, chose Sun 11 Oct | ![01](01.png) |
| 02 | Change day to Sun 11 Oct shows that day, phone in Europe/Prague | FAIL | shows Sat 10 Oct, chose Sun 11 Oct | ![02](02.png) |
| 03 | Change day to Sun 11 Oct shows that day, phone in America/New_York | pass | shows Sun 11 Oct, chose Sun 11 Oct | ![03](03.png) |
