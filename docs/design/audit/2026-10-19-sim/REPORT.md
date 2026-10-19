# Ten-day centre simulation, 19-28 Oct 2026: audit report

Independent admin pass on a phone (375x812) against a throwaway stack (`audit-sim`, :8310; clock faked per day; your :8080 untouched). Evidence: `shots/` (phone screens, PDF pages), raw log: `field-notes.md`. Nothing in the app was changed.

## What was simulated
- Centre: 10 therapists (7 at start, 3 added on day 4 at the peak), 3 doctors, 7 therapy rooms + 2 consult rooms, 32 guest rooms (40 beds), yoga/pranayama/aarti classes, 07:00-19:00, weekly offs staggered.
- 100 guests: 10 already in house, then 90 arriving across 19-28 Oct at their own times (8 to 12 a day, weekend bump). Mix: 27 day patients, stress, back, arthritis, eye, weight, rejuvenation, 7 full panchakarma (14 and 21 nights). 18 foreign (Form C), 2 couples, hypertension, diabetes, nut allergy, lactose, Jain, vegetarian, pregnancy; 2 no-shows, early leavers, extensions.
- Protocols follow published Panchakarma order (preparation with snehapana, then purgation, then basti, then recovery diet); sources: [Ayurvaid sansarjan karma](https://ayurvaid.com/treatments/sansarjan-karma/), [Panchakarma phases overview](https://biologyinsights.com/what-is-panchakarma-treatment-therapies-and-phases/), [contraindications list](https://iframe.spadreams.nl/ibe/pdf/ayurveda-contraindications-english-pdf1788). Public sources do not give a day-by-day rule; protocols are plausible, not clinical advice.
- Peak (Mon 26 Oct): 46 in house, 59 treatments, all 32 guest rooms full, 47 on the "need you" pill, 5-page patient sheet and 5-page rota.

## How it was run (honest limits)
- Bulk volume (about 85 of the 100 guests, their treatments, closing each day) went in through the API with the app's own booking rules. Phone UI was driven by hand for: new arrivals (3 incl. a couple), therapist sick call, doctor sick call, room breakdown, oil shortage, no-show, extension, diet change, guest cancel, adding a therapist, therapist link, all five printed sheets.
- Not driven end to end: unannounced staff no-show found mid-day, power cut, patient-link self sign-up, discharge summary and Form C filing through the UI, weekly doctor review through the doctor link (only the plan preview was read). These are listed as open in the last section.
- Sim artefacts, not app faults: treatment history shows real-clock creation times; my narrow time windows caused false "no slot" results until widened.
- The 7-therapist start was too small for 46 in house. 712 of 878 planned sessions (81%) were booked; 67 of 97 present guests ended short. That is a capacity finding about the sim, but the app's silence about it is real (see F1).

## Wow, keep as is
1. Therapist sick, room breakdown, doctor away, oil out: one pattern. Person or room, "Not available", a consequence line ("4 treatments today will need another therapist"), "Save and fix the day", the plan in words, Accept, Undo. About 8 taps, 25 s. (`d2-*`)
2. Same pattern for a whole therapy ("Shirodhara: not available"): per-treatment options, one tap to accept "Fri 23 Oct, 12:30 with Sunil Kumar (1 day later)" with inline Undo. (`d4-*`)
3. Morning glance: staff days off as "information, not counted", Form C overdue per guest, bulk "Set diet for 3". (`d1-morning-need-you`, `d3-need-you-grouped`)
4. New guest in about 7 taps: room and first consultation pre-picked, Undo; a couple's second guest defaults into the same apartment. (`d1-new-*`, `d2-couple-added`)
5. Treatment card "Something wrong?": didn't come, late, cancel, therapist not in, room can't be used, each with Undo. (`d3-something-wrong`)
6. Stay changes with a plain consequence line ("3 days longer... Accommodation 9 nights Rs 22,500"). (`d5-extend-stay-consequence`)
7. Printed sheets: one tap prints and offers four more; rota lists the oils and tools per treatment; guest-rooms sheet says which room to make up first. (`d1-print-toast`, `pdf-d8-rooms-1`)
8. Therapist link: required checklist, BP box, Done, Room ready, issue/SOS always at the bottom. (`d4-therapist-link-day`)

## Issues, ranked (worth fixing: yes / later / no)
### Safety and wrong paper
- **F1 Allergy, intolerance and diet limits do not reach the kitchen.** No field for them; free text goes in "Medication and notes". It prints on the patient sheet labelled "Treatment:" in 7 pt, inside a block whose plan serves "soaked almonds" (`pdf-d5-residents-1`), and not at all on the kitchen sheet (buttermilk cooked for a lactose-intolerant guest, `pdf-d3-kitchen-1`). Yes, first fix: one "Food limits" line per guest, bold on both sheets, counted on the kitchen sheet.
- **F2 Therapist's supply note is buried.** "Ksheerabala oil finished" sits last in "need you" under "Information, not counted" after 20 rows; only SOS is counted. No "supply missing" or "patient unwell" choice in the issue sheet. Yes (`d4-note-buried-in-need-you`, `d4-therapist-raise-issue-options`).
- **F3 No contraindication guard.** Pregnant and hypertensive guests can be booked Pizhichil, basti or steam with no warning; it exists only as free text. Later (needs a rule set from the doctor, not engineering guesses).

### Daily jobs that break at peak
- **F4 Capacity is invisible.** At 36 treatments for 6 therapists on a Friday nothing said "full"; the booking API names its failure `OUT_OF_RANGE` and `NO_MATCHING_TIME_SLOTS`, and the only free time was 18:00. 2 to 3 sessions per guest went unbooked quietly. Needs: a "Fri 23: full after 12:00, 3 therapists after 15:00" line, and which skill is the bottleneck (here Nasya and two-therapist Abhyanga). Yes.
- **F5 No "did not arrive".** Only Stay > Leaves today; the guest becomes a 2-day stay with a discharge and Form C duty, package still 14 days Rs 70,750, room blocked until then (`d3-noshow-*`). Yes.
- **F6 Weekly review is half there (corrected in the second pass).** The doctor's link has a Round and a 'review due, not booked' flag, and saving a plan says 'The centre books from it' (wow, `d9-doctor-*`). Missing: the flag starts at day 8 (a 7-night guest never gets one), the card says 'Next: None booked' mid-stay, the printed doctor sheet has no round, and a saved plan books nothing by itself. Yes (#981).
- **F7 Planner wording and options.** Replan rows differ: "same time" vs "10:00 with Vishnu Prasad" (4 hours earlier, no room named, no "earlier"); suggestion "2 days later, after their stay ends" shown as the green default; no alternative therapy (Takradhara for Shirodhara); no "tell the guest" step. Yes, small.
- **F8 Medical reasons.** "Wants to cancel" is the only cancel; no "doctor stopped it" and the lost session is not offered at the end of the course. Later.
- **F9 Diet change is one day at a time.** To stop buttermilk for 2 days: re-enter 4 meal boxes per day, no "from today until leaving", no Undo on "Meals saved". Yes.
- **F10 Always-red rule.** "Arrival notes not written" is red for 13 to 47 guests every day, including 3 leaving today at 06:45. Pill reached 47 at peak. Make it quiet by default. Yes (tiny).
- **F11 Shared double apartment with strangers.** Default room picks the first free room, so unrelated adults share a 2-bed apartment (A3). Ask or prefer empty rooms. Yes.
- **F12 New therapist can do everything, every day 07-19.** A new hire could be put on Virechana. Default to none ticked meaning none, or a prompt. Later.
- **F13 Planning a new guest's week** is an alphabetical list of all 40 therapies, each booked every day or none; no starter pack per complaint and no course shape (once, every other day). Yes; biggest time sink for the doctor-to-bookings step (`d1-plan-next-week-new-guest`).

### Smaller
- Printed header repeats each class twice ("Morning yoga ... Morning yoga"); reproduce via the UI before filing (created by API here). Footer "Made with Ruta, try it free" on a live centre's sheets.
- Menu sheet re-orders itself by screen, so thumb memory fails; typing a name shifts the Gender buttons (a layout jump); Leaving defaults to 14 nights and needs the date wheel; guest-room picker lists occupied rooms with an unclear date.
- Snehapana (oral ghee) is given a treatment room; Rooms usage is lopsided (Basti suite 85 min, Ashwini 650).
- API auto-booking will place sessions on past days.
- "Example centre" banner remains on a fully set-up centre.

## Scenario coverage
| Scenario | Result |
|---|---|
| Room breaks down | done, wow |
| Therapist sick (early shift) | done, wow; delays eye treatments 4 h (only senior staff) |
| Therapist no-show, not announced | done 27 Oct 10:05: 2 moved, 5 wait (no free pair); honest but unexplained (#987) |
| Doctor on leave | done; consults flowed to other doctors |
| Guest unwell / stops | partly (cancel works; no medical reason, F8) |
| Diet does not suit | partly (F9) |
| Oil or resource missing | done: fixable by moving; not fixable instantly; note is buried (F2) |
| Late arrival, no-show, extension, early leave | arrival times and extension done; no-show F5 |
| Public holiday (Dussehra 20 Oct) | Day screen shows no holiday; centre ran as normal |
| Guest rooms full | reached 32/32 on 26 Oct; sheet and picker held |
| Weekly doctor review | plan preview read only (F6, F13) |
| Form C | done: copy-line sheet with due date, 'Mark Form C filed' (wow); 15 of 16 foreign guests overdue because nobody filed |
| Discharge summary | read: fills itself from the stay (days, treatments, passport, doctor); 3 of 8 ready, rest blank for hand-writing; BP column empty; footer says 'a demo centre' because of the example flag |
| Guest link | done: day, times, room, therapists, meals, details 6 of 9 (wow) |
| Records for inspection | month PDF read: 10 pages, 100 stays, treatment counts; no Form C or discharge number column |
| Power or water cut | not possible for the whole centre, whole days only (#985) |
| Weekly diet follows the course | no: one segment for a 14-night purification (#986) |

## Suggested next step
Issues opened: #977 food limits, #978 supply note, #979 full day, #980 did not arrive, #981 weekly review, #982 diet by day, #983 red arrival notes, #984 starter packs; second pass added #985 part-day closure, #986 diet follows course, #987 planner at capacity. Still not run: patient self sign-up through the link, SOS handling end to end, a pregnancy guard rule set from the doctor, a 10-therapist rerun after #979.
