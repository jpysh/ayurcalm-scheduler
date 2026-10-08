# UAT 2026-10-08-523

Base http://localhost:8142, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | A patient with no review booked has Plan next week | pass | true · Review Less 914 · Plan next week · Next · None booked · book one · Plan | ![01](01.png) |
| 02 | It repeats the week they had | pass | Next week · Review · Fri 9 Oct to Thu 15 Oct, as this week. Untick or swap a line; all of it is booked or none. · THERAPIES · Janu Vasti · 09:00 · Anjali Verma · 1 day · Swap · Janu Vasti · › · Abhyanga · Agnikarma · Anuvasana Vasti · Avagaha Sweda | ![02](02.png) |
| 03 | Book all books them, with one Undo | pass | Booked 3 treatments for Review, Fri 9 Oct to Thu 15 Oct · Undo | ![03](03.png) |
