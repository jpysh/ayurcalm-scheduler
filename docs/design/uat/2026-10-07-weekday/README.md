# #405 UAT, 7 Oct (lite seed, 375x812)

Before is the :8201 demo (main); after is the branch on :8131. Every date read off the page.

| Where | Result | Before | After |
|---|---|---|---|
| Patients list | pass | leaves 27 Oct ![](before/01-patients.png) | leaves Tue 27 Oct ![](after/01-patients.png) |
| Card header (the Stay row uses the same helper) | pass | Staying 7 Oct to 27 Oct ![](before/02-card.png) | Staying Wed 7 Oct to Tue 27 Oct, one line ![](after/02-card.png) |
| Leave rows | pass | Therapist · 13 Oct ![](before/04-leave.png) | Therapist · Tue 13 Oct ![](after/04-leave.png) |
| Booking therapy facts | pass | had 6 Oct ![](before/05-booking-facts.png) | had Tue 6 Oct ![](after/05-booking-facts.png) |
