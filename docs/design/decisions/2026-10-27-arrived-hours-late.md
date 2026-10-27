# Arriving hours late is the guest away until then (27 Oct)

Decided 27 Oct for #1240, situation #2 of the stays audit.

- "Arrived late today…" on the guest's stay sheet asks one thing, the arrival time, and records the guest away from midnight until then, described "arrived late". No new kind of record: the guard already refuses a treatment while a guest is away, the kitchen and day sheet already show it.
- Recording a guest away for some hours now plans their day at once, in one pass through `planDay`, the way a room out of use does: earlier treatments move later the same day, what cannot is left under "need you". Whole-day absences still do not move anything; they wait for the admin as before.
- Undo, or deleting the absence on Time off, puts every treatment back.
- Arriving days late stays on the dates (#1193).
