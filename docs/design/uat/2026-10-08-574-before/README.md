# UAT 2026-10-08-574-before

Base http://localhost:8140, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | A switched-off person is refused on their next tap | FAIL | their session answered 200 while on, 200 once switched off | ![01](01.png) |
| 02 | The phone of a switched-off person lands on the sign-in page | FAIL | signed in at /admin/schedule, after switch-off at /admin/schedule | ![02](02.png) |
