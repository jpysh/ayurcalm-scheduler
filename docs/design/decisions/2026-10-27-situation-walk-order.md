# The stay situations are walked before more is built (27 Oct)

Decided 27 Oct by the maintainer, for the stays and guest-rooms audit (`audit/2026-10-26-stay-room-situations.md`).

- All 78 unknown situations are walked in the running app, High first. Each that works is marked handled with what was checked; each that fails gets an issue and is fixed that night.
- Walking comes before building: then group bookings step 2 (#1196), then #1199, #1200, #1202, #1203, #1201.
- Rare (Low) gaps are marked "Not for launch" with a reason and are built only when a centre asks.
- At most three sessions at once, on files that do not overlap: stays (walk, fixes, features, one after another), the nightly browser test repair, and the release plan.
- Each changed screen gets an after-shot at 375px; at the end, one polish batch over Stays, Guest rooms and Groups with a before and after sheet, tap counts and a design critique.
