# Answers to the pre-launch audit's questions (22 Oct 2026)

Decided by the maintainer in chat.

- **A therapy's length changes (#1079):** saving asks "Also change the N booked? / Only new bookings". A clash this causes goes to the day check.
- **A therapist leaves for good (#1080):** deleting offers to hand their coming treatments to others first, through the same planner as leave; what cannot be placed waits under need you. Past treatments stay on record.
- **Steam right after massage (#1081):** nothing added. A centre that wants a combined therapy creates it in Therapies.
- **Diet steps (#1082):** a plan carries Day 1, Day 2... steps, counted from the day the plan starts for that patient, one or more meals each. What is served: what the doctor wrote for this patient alone; else that day's step; else the plan's own meal. When a plan's steps are finished, or every plan has ended and they still stay, they move to General sattvic. Built before launch, after the audit bugs, in two PRs.
