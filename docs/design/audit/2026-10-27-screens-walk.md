# Screens walk, 27 Oct

Charter: every admin screen except Stays, Guest rooms and Groups, on main 5aff0531, own stack (walkscreens, :8401), 375x812, Playwright.
Conditions: Kolkata at 100% and 200% text; centre in Sydney (phone 23:50 Sydney); centre in New York (phone 23:50 New York, and a phone in India); a brand-new centre after clearing the demo, at 100% and 200%. After closing is covered by the two 23:50 runs (centre closes 18:00).

## Scores (out of 5)

| Screen | Score | Notes |
|---|---|---|
| Day | 4 | Far zones after closing: both open on the centre's next day with today ringed. Floating buttons over text at 200% is #1290. |
| What needs you | 4 | Counts match the Menu number. Rules sheet at 200%: #1334. |
| Booking | 5 | On an empty centre Book leads to adding therapies. |
| Therapists and leave (Staff, Availability) | 5 | Empty states say what to do. |
| Rooms | 5 | |
| Therapies | 4 | Title cut from Settings at 200%: #1333. |
| Diet and kitchen | 5 | Kitchen sheet: each meal adds up to the 38 staying. |
| Settings | 4 | All rows open; see #1333, #1334. |
| Make it mine / empty centre | 5 | Getting-started list with four steps; nothing broken without data. |
| Sign-in | 5 | |
| Therapist links | 3 | Week strip overlaps at 200%: #1332. |
| Printed sheets | 5 | All five sheets dated the centre's day; no text cut in `pdftotext -layout`. |
| Change day | 3 | Choices overlap at 200%: #1331. |

## Findings

- #1331 cut text: Change day choices overlap at 200%.
- #1332 cut text: therapist link week strip overlaps at 200%.
- #1333 cut text: Therapies title cut when opened from Settings at 200%.
- #1334 cut text: What needs you rules one word per line at 200%.
- #1335 guard for the next test repair: extend the 200% cut-text check to these screens.

No clock or text-vs-server finding: every screen asked the server for the centre's day in Sydney and New York.
