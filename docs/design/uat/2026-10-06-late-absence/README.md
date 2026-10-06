# #369 — the therapist-off problem lasts into the evening

Lite seed, 375×812, shots taken at 18:36 IST on 6 Oct.

| Check | Before | After | Result |
|---|---|---|---|
| Absent therapist's treatments (rota, pdftotext) | 09:00, 09:30, 10:30, 11:30: nothing to fix after 12:30 | 09:00, 15:30, 17:00, 18:00 | pass |
| Inbox at 18:36 | "2 to know", nothing to fix (issue, 14:52) | "Nisha is waiting: Ravi Gupta is not in" with "Neha Singh, same time" ([inbox](after-inbox.png), [menu](after-menu.png)) | pass |
| Patient kept to their own therapist | yes | yes (Aditya Nair) | pass |
| qa `scheduleInvariants` | — | new: the therapist off has a treatment at or after 18:00 | pass |
| Taps | — | unchanged (seed only) | same |
