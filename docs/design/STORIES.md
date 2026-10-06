# The stories (#285)

Screens are derived from these, not the other way round. Each story starts from the outcome the admin
wants, walks back to the first thing they see, and only then names a screen. Ranked by harm to the
centre if the job goes wrong or is slow. Taps count from the day screen, phone in one hand.

The word is **patient**, on every screen, printed sheet, summary and private link (decided 1 Oct; it
replaces "resident"). Code and table names keep their old names.

Format: **Outcome** · **Trigger** · **First view** (facts a decision needs, no tap) · **Path** (taps) · **Fails when**.

| # | Story | Taps now → target |
|---|---|---|
| 1 | Morning glance: is today OK, and what needs me? | 0 → 0 |
| 2 | Print the day sheet | 1 → 2 (5 Oct, Print in the Menu) |
| 3 | Fix the day when a therapist or room drops out | 2 → 2 |
| 4 | Add an arriving patient | 4+ → 2 (3 walked, 6 Oct: + is on the bar) |
| 5 | Book or move a treatment | 2 → 4 |
| 6 | Find a patient or a fact | 2 → 2 |
| 7 | Set or change meals, by date | 4 → 3 |
| 8 | Discharge a patient | 5 → 3 |
| 9 | Record a therapist's leave | 5 → 4 |
| 10 | Change a stay | 4 → 3 |
| 11 | Choose or change a patient's package | new → 3 |
| 12 | Choose or change a patient's accommodation | new → 3 |
| 13 | See who is in and when, and fix a gap | (#351) |
| 14 | Review a patient's week and plan the next | 10 → 3 |

## 1. Morning glance, and one home for everything that needs the admin
**Outcome:** I know in three seconds whether I must act, and I never go tab by tab to find out.
**First view:** the floating pill above the bar, kept from #144: "4 need you". Nothing needs me: no pill. Sections with nothing in them are hidden, not shown as 0. Not on the pill: a day with nothing booked (normal).
**The pill is the inbox for the whole app.** One tap opens one sheet in sections, Day · Patients · Team, each item with its one action. Only items that need action count. Information ("Kriti is on leave today") shows in grey in the sheet and does not count. Patients and Team each carry a "Needs attention" chip that filters to the same items, and a gear that opens that screen's rules.
**What counts is the admin's choice** (Settings → What needs you). Each rule has an on/off switch and, where useful, a number. Defaults:

| Rule | Default | Number |
|---|---|---|
| Therapist not in, room out, clashes | on, locked | none |
| Leaves today, no discharge summary | on | none |
| Arrival steps still open | on | 24 hours after arrival |
| No diet plan | on | 24 hours after arrival |
| Vitals not recorded by the therapist | on, once therapists record (story 18 in #286) | 4 hours after the treatment starts |
| Who is on leave today | information only | none |
| Leaves tomorrow, summary not started | off | none |

A rule that has no data yet (vitals) exists but shows nothing. In-app only: no push or WhatsApp (revisit with #194).
**Fails when:** a problem needs a tab to be seen, or the day is red because of something normal.

## 2. Print the day sheet
Print moved into the Menu on 5 Oct (two taps: Menu, Print the day's sheets) so the bar can give the date room; the maintainer decided it. The toast above the bar gains **Open** and **Share** beside the existing sheet choices.

## 3. Fix the day when someone drops out
**Outcome:** everyone affected still has a treatment, and I can undo it. **First view:** on the pill's sheet: who, what breaks, and the whole plan (who moves to whom) as a preview. **Path:** pill → "Move all N treatments" (2), toast with Undo. **Fails when:** applied without showing what moves.

## 4. Add an arriving patient
**Outcome:** the patient is in, with a consultation booked and nothing else forced. **First view:** on Patients, + says "New patient". The form: name, gender, arriving, leaving, and a **Stays on site** switch (on by default). Under them a row, "First consultation · Wed 11:00 · Dr Rao" (doctor named), already booked by the system in the next free doctor slot; tap to change, or "Later" to skip. "More details (optional)": phone, emergency contact name and phone, address, country, passport or ID, registration number.
**Path:** + → Add Meera Nair (2 plus typing). They land on their card with rows and arrows for Package, Diet, Accommodation, Therapies: nothing forced, no "choose a diet" gate. **Fails when:** the form asks for a passport before the guest has sat down.

## 5. Book or move a treatment
**Outcome:** the patient has a treatment at a time a therapist and room are free, and I stayed in control. **First view:** one sheet. "Who?" is a search at the bottom above the keyboard; above it at most five patients with no treatment yet today, then recent ones. No "already booked" list (50 a day is too long; search covers it). Choosing a patient fills the rest in place, every field editable: **therapy** (their last one, with its date, "Abhyanga · 24 Sept"), **date**, **time** (free times, best marked), **therapist** (auto-assigned, changeable), **room** (auto, changeable). Free therapists and rooms are listed first; busy ones are greyed, so a clash is never picked by accident. The button names the outcome: "Book Ananya, Wed 10:45". A **Sessions** line (one by default) makes it a course: one a day from the date at the same time and therapist, all or none, one Undo. **Path:** + → who → Book (3); a course adds the Sessions tap (4). Move: tap the row → change time → Save (3). **Fails when:** the system picks and the admin cannot see or change who, or a loading flash appears.

## 6. Find a patient or a fact
Search at the bottom above the keyboard, results with the fact asked for (diet, room), flags where something needs doing. On a list it filters that list first.

## 7. Set or change meals, by date
**Outcome:** the kitchen cooks the right thing on each day, after the doctor's visit. **First view:** the Diet row on the card is a short timeline: "From 30 Sept · Light, no curd" then "From 5 Oct · Pitta-pacifying"; the last runs to the leaving date; no gaps. **Path:** card → Diet → pick a plan (in view on opening) → Start, Today preselected (3); **Today** and **Tomorrow** sit above the date picker. "Change diet from a date" adds another. Plans come from templates; **Edit this plan** opens the template with "used by 3 patients" and a choice: everyone on it, or this patient only. **Fails when:** a change date is implicit, or editing a template silently changes other patients.

## 8. Discharge a patient
**Outcome:** the summary prints, complete or not. **First view:** on the card a bar, "Discharge summary · 5 of 8 ready"; tap it to see what is missing, each item opening its field. **"Print summary" is always available**; missing fields print as blank lines to write by hand. Never blocked. **Path:** flagged row → Print summary (3).

## 9. Record a therapist's leave
**Outcome:** the leave is recorded and, if I want, the day is already replanned. **Form:** who, from, to, reason (optional). Under it a live line: "3 treatments that day will need a new therapist". Two buttons: **Save and plan the day** (main; goes to the replan sheet with the suggestion) and **Save, plan later** (the leave then waits on the pill). **Path:** Menu → Leave → + → Save and plan (4).

## 10. Change a stay
**Outcome:** the dates are right and what followed them is tidy. A shortened stay marks the treatments after the new date **cancelled**, reason "stay shortened", kept in the patient's record and audit trail; meals stop that day; the package and accommodation lines say how their totals change. **Path:** card → Stay → date → Save (3).

## 11. Choose or change a patient's package
**Outcome:** the patient's package is recorded, and I can change it any time in their stay, because the decision often comes late or changes as treatment goes on. **Reference:** the centre's Panchakarma packages (3, 5, 7, 10, 12, 14, 21, 28, 40, 45 days), price and registration charge shown as **one figure** ("14 days · Rs 70,750"). **First view:** on the card, a Package row: the package or "Not decided yet". The picker lists the packages (editable in Settings → Packages: name, days, price, registration charge, notes). Choosing one that differs from the stay says so in a consequence line ("14 days ends 13 Oct; the stay ends 10 Oct. Match the stay?") and never changes dates by itself. The package shows on the patient's record and view. **Not billing:** prices are reference, no invoices or payments (out of scope, #53). **Path:** card → Package → pick (3).

## 12. Choose or change a patient's accommodation
**Outcome:** where the patient stays on site is recorded and changeable. **Reference:** the centre's room types with a per-day price (for example Trishul House, Nanda House, Special Apartments, Huts), editable in Settings → Accommodation (name, per-day price, notes; placeholders for capacity and amenities). **First view:** the Stays-on-site switch (story 4), and on the card an Accommodation row: type, "9 nights · Rs 14,400" (per-day price × nights; no extra charges are modelled, an optional free-text extra line carries none). Picker lists the types; add or remove anytime; optional room number and note. **Path:** card → Accommodation → pick (3). **Later (#286):** rooms with numbers and occupancy, and hotel guests who are not patients, from the same portal.

## 13. See who is in and when, and fix a gap
**Outcome:** for any day, the admin knows which doctors and therapists are in, their hours, and how full each is (#351, decided 6 Oct). **First view:** Team, with the Day screen's week strip on top, then Doctors and Therapists, each row "Priya Patel · 07:00–15:00 · 5h of 8h booked"; away struck through with the reason, a day without hours "Day off". **Path:** Team → a day (1); a row opens what changes for them (late, early, away, details). **Built (#351 part 2):** a "Too few therapists in" line for any hour with fewer than two in, "nearly full" / "lightly booked" on a row, and an Hours line on the card (one range a weekday). **Fails when:** the admin has to open each person to learn their hours, or a week grid has to be decoded.

## 14. Review a patient's week and plan the next
**Outcome:** after the doctor's weekly review, the patient's next week is booked, and no day before it is empty by accident (#350; decided 6 Oct: the admin books, the doctor writes; reviews are weekly on the same weekday; next week is usually this week with one therapy swapped). **First view:** on the card, **Next days**: each day to the end of the week with what is booked, the review day marked, a day before the review with nothing booked flagged "Nothing booked", empty days after it folded into one "Not planned yet" row; under **Doctor**, the last review's note and the plan. Tapping a day books on that day. **Path:** card → **Plan next week** → Book all (3): one sheet with this week's therapies ticked, each swappable, and the next review a week on; all or nothing, one Undo (#354). **Fails when:** a planned week is only visible on the Day screen, or the doctor's note is not beside the booking it asks for.

## What each story asks of the kit
Two-capsule bar (all) · floating pill and inbox sheet with sections (1, 3) · row with a flag (1, 4, 8) · one-sheet booking with bottom search (5, 6) · timeline list (7) · checklist bar (8) · two-button foot (9) · consequence line (9, 10, 11) · picker list with description and price (7, 11, 12) · switch row (4) · toast with Undo (3, 5, 9). Reference catalogues (templates, packages, accommodation, attention rules) all live in Settings and open from the patient screen through one gear or Edit link.

## Closing walk (1 Oct, #285 session 9)
Each story walked on a 375 × 812 phone against a fresh demo centre; taps from `tapCount.spec.ts`, counted from the day (or the open card where the story says so). Every job is at or under target.

| # | Story | Path walked | Taps | Target | First view as the story says |
|---|---|---|---|---|---|
| 1 | Morning glance | open the app | 0 | 0 | the pill ("9 to know") above the bar; empty sections hidden |
| 2 | Print the day sheet | Menu, Print | 2 | 2 | toast with Open and Share; sheet says "patient" |
| 3 | Fix the day | pill → Move all | 2 | 2 | who, what breaks, and the plan before applying; Undo |
| 4 | Add an arriving patient | + → gender → Add | 3 | 2 | four fields, consultation pre-booked; the third tap is the gender, which nothing preselects (#283) |
| 5 | Book or move | + → who → therapy → Book | 4 | 4 | five suggestions, search above the keyboard, no therapy chosen for them (#330), every line editable; a second therapy for the same patient is Add another → therapy → Book (3) |
| 6 | Find | Search → the person | 2 | 2 | result with the fact asked for |
| 7 | Meals by date | card → Diet → plan → Start | 3 | 3 | timeline of plans to the leaving date; Today and Tomorrow chips |
| 8 | Discharge | card → Discharge summary → Print | 2 | 3 | "1 of 8 ready", Print always on |
| 9 | Leave | Menu → Leave → + → Save and plan | 4 | 4 | live line "N treatments that day will need a new therapist" |
| 10 | Change a stay | card → Stay → date → Save | 3 | 3 | Arrived and Leaving as change lines, consequence line on change |
| 11 | Package | card → Package → pick | 2 | 3 | nearest package preselected, "ends 7 Oct, the same as the stay" |
| 12 | Accommodation | card → Accommodation → pick | 3 | 3 | "6 nights × Rs 4,000 = Rs 24,000", reference only |
