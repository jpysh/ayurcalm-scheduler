# UAT Team and Rooms (#328)

Base http://localhost:8100, 375x812. Written by scripts/uat-328.mjs; it seeds one "Uat Store" room out of use.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | Menu: Team and Rooms are separate tiles, and the whole menu fits without scrolling | pass | Menu 25 to know › Search Patients, therapists, treatments, any day › Change day Mon 5 Oct · Today · 22:50 › Print the day's sheets › GO TO Patients 65 in house  | ![01](01.png) |
| 02 | Team: its own header and count, the week, therapists and doctors, the centre's lists; no rooms | pass | ‹ Day Team 21 in · 2 not in This week 999h booked of 1694h (59%) · 6 away some days › THERAPISTS AND DOCTORS 23 Alok Singh Therapist › Anjali Chatterjee Therapi | ![02](02.png) |
| 03 | Team +: opens the therapist or doctor form straight away | pass | Add therapist or doctor Name, role and gender are needed. The rest can wait. Name Role Therapist Doctor Gender Used when a therapy needs a therapist of the pati | ![03](03.png) |
| 04 | Rooms: its own header with the count and what is out today; no therapists | pass | ‹ Team Rooms 25 rooms · 3 out ROOMS 25 Agni Has massage table, shower, steam, herbal oil › Brahma Has massage table, shower, steam, herbal oil › Chandra Has mas | ![04](04.png) |
| 05 | Rooms +: opens the room form straight away (add a room: Menu, Rooms, +) | pass | Add room Give it a name and tick what it has. Name What it has A therapy that needs something is only booked into a room that has it. bp monitor dhara stand exa | ![05](05.png) |
| 06 | Search on Rooms searches rooms only | pass | ‹ Team Rooms 25 rooms · 3 out ROOMS 3 Uat Store 8qq Nothing special Out of use today › Uat Store t39 Nothing special Out of use today › Uat Store x Nothing spec | ![06](06.png) |
