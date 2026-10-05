# UAT 2026-10-05-menu-polish

Base http://localhost:8097, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | Menu on the day: Book a treatment is the one filled button; no "Back to the day"; Show by is there | pass | filled Book button 1, order: Menu | Book a treatment | 15 to know | › | Search treatments | › | ![01](01.png) |
| 02 | Menu on Patients: New patient is the filled button, "Back to the day" is there, no Show by | pass | Menu | New patient | 15 to know | › | ![02](02.png) |
| 03 | Week strip: a rule under it, and the month follows a swipe to another month | pass | rule 1px; heading October 2026 to November 2026 after four weeks | ![03](03.png) |
| 04 | Needs-you row sits above the Book button when something needs fixing | pass | nothing needs fixing on the seeded day (170 treatments); info row sits under the actions | ![04](04.png) |
