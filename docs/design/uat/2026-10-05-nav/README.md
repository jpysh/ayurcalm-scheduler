# UAT 2026-10-05-nav

Base http://localhost:8098, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | Day: a filled + (Book a treatment) beside the menu, no ‹, and the Menu no longer repeats Book | pass | + 1, ‹ 0; menu: Menu | 15 to know | › | Search | Patients, therapists, treatments, any day | › | ![01](01.png) |
| 02 | Day: tapping + opens the booking sheet | pass | Book a treatment | Who is it for? | NO TREATMENT YET TODAY | 5 | ![02](02.png) |
| 03 | Leave: ‹ Day and + Add leave; + opens the sheet; ‹ Day returns to the day | pass | header/+ true, sheet true, back on the day true | ![03](03.png) |
| 04 | Patients opened from Leave: ‹ Leave returns to Leave; + is New patient | pass | ‹ Leave 1, + 1, back on Leave true | ![04](04.png) |
| 05 | Team and rooms: + opens the "what are you adding" sheet | pass | Add to the team | What are you adding? | Therapist or doctor | Someone who gives treatments or consultations | › | ![05](05.png) |
| 06 | Diet plans: ‹ Day and + New diet plan | pass | ‹ and + present: true | ![06](06.png) |
| 07 | Settings: ‹ Day, no + | pass | ‹ 1, bar buttons 1 (the menu only) | ![07](07.png) |
| 08 | Diet plans, scrolled to the end: the last row is clear of + and the menu | pass | last row bottom 552, + top 746 | ![08](08.png) |
