# The stories: the approved top 50 (7 Oct)

Screens are derived from these, not the other way round. Ranked by how often × harm to the centre if it fails × admin time saved (Task A, https://claude.ai/artifact/6fkpmwnJwgGQM4C7au77Bd); walked at 375×812 in Task B (https://claude.ai/artifact/UP2pKqiC2pakVGNvvBaVyv); both approved by the maintainer 7 Oct. Dropped: s31 stay statement, s39 offline sheet (the offline rule lives in DESIGN.md §6); s28 consent left out, unanswered. Rows marked after launch are the therapist, doctor and patient. Nothing is gated. The word is **patient** everywhere.

## The wow bar

Score every job 0, 1 or 2 on each line: 16 points. A job ships at **13 or more with no zero on time, facts or the sheet** (lines 1, 3, 6).

| # | Line | 2 | 1 | 0 |
|---|---|---|---|---|
| 1 | Time to done | Under the job's budget on a 375×812 phone (returning booking 30 s, new patient 60 s, print 10 s) | Within 1.5× | Over 1.5× |
| 2 | Typing avoided | Nothing the app knows is typed | One field that could be filled | Retypes known facts |
| 3 | Facts with no tap | Every fact the decision needs on the first view | One fact one tap away | Must open things to decide |
| 4 | No dead ends | Every refusal or empty state carries the way forward, filled in | Named but not filled | Text only, or a greyed button |
| 5 | Undo, or says what will happen | Undo for 5 s, or a consequence line before | One of the two, partly | Silent change |
| 6 | The printed sheet is right | Every change correct on paper (`pdftotext`) | Right but cramped or late | Wrong or missing |
| 7 | One-handed | All steps in the lower half | One top tap, with swipe-back | Needs two hands |
| 8 | Calm tone | Plain words, no alarm on a normal day | One noisy flag or word | Red for normal, jargon, jumping layout |

**Time to done** (touch keystroke-level model; confirm with a stopwatch): `seconds ≈ taps × 0.5 + typed characters × 0.3 + decisions × 1.35 + waiting`. Taps (`tapCount.spec.ts`), decisions per job (≤ 3), 44×44 targets and contrast are reported beside it, not scored.

## The ranked list

Have / Partial / Missing is Task A's; the verdict, time and wow score are Task B's walk (7 Oct, before the Audit track fixes).

| Rank | Story | Have | Task B | Time | Wow |
|---|---|---|---|---|---|
| 1 | s1 Morning glance: is today OK, and what needs me? | Have | Friction | ≈5 s | 13/16 |
| 2 | s2 Fix the day when a therapist or room drops out | Have | Fail | never done | 8/16 |
| 3 | s3 Print or share the day sheet | Have | Pass | ≈3 s | 15/16 |
| 4 | s4 Book or move a treatment | Have | Pass | ≈6 s | 16/16 |
| 5 | s5 Review a patient's week and plan the next | Have | Friction | ≈4 s | 15/16 |
| 6 | s6 Share the day with staff by private link and WhatsApp | Have | Friction | ≈4 s + paste | 13/16 |
| 7 | s7 Add an arriving patient | Have | Pass | ≈7 s + name | 15/16 |
| 8 | s8 Doctor's consultation on arrival and the daily round | Partial | Friction | — | 13/16 |
| 9 | s9 Form C ready within 24 hours for a foreign guest | Missing | Missing | — | — |
| 10 | s10 Record a therapist's leave | Have | Fail | ≈6 s, then stuck | 12/16 |
| 11 | s11 See who is in and when, and fix a gap | Partial | Pass | ≈2 s | 15/16 |
| 12 | s12 Panchakarma order is kept | Partial | Friction | ≈8 s | 15/16 |
| 13 | s13 Two-therapist and same-gender pairs held everywhere | Have | Pass | ≈4 s | 15/16 |
| 14 | s14 Kitchen gets the day's meals | Partial | Friction | — | 12/16 |
| 15 | s15 Find a patient or a fact | Have | Friction | ≈3 s | 14/16 |
| 16 | s16 Set or change meals, by date | Have | Pass | ≈4 s | 15/16 |
| 17 | s17 Week ahead: arrivals, departures and empty days | Partial | Friction | — | 13/16 |
| 18 | s18 Arrival steps checklist | Partial | Friction | — | 14/16 |
| 19 | s19 Change a stay | Have | Pass | ≈4 s | 15/16 |
| 20 | s21 Day visitors and outpatients | Have | Pass | ≈7 s | 16/16 |
| 21 | s22 See and undo what changed | Have | Fail | — | 11/16 |
| 22 | s23 Medicines on the sheet and to take home | Partial | Friction | — | 13/16 |
| 23 | s24 Discharge a patient | Have | Pass | ≈3 s | 16/16 |
| 24 | s20 Room numbers and occupancy | Missing | Missing | — | — |
| 25 | s25 Passport or ID scan fills the patient | Missing | Missing | — | — |
| 26 | s26 Choose or change accommodation | Partial | Pass | ≈2 s | 16/16 |
| 27 | s27 Prakriti and structured vitals | Partial | Friction | — | 12/16 |
| 28 | s29 Arrivals' details before they come | Missing | Missing | — | — |
| 29 | s30 Choose or change a package | Have | Pass | ≈2 s | 16/16 |
| 30 | s32 Follow-up after discharge | Partial | Friction | — | 14/16 |
| 31 | s33 Classes and events (yoga, prayer) | Have | Pass | ≈2 s | 16/16 |
| 32 | s34 Re-book a returning guest | Partial | Fail | — | 11/16 |
| 33 | s35 Records for an inspection | Missing | Friction | — | 13/16 |
| 34 | s36 Set up the centre the first time | Have | Pass | not walked | — |
| 35 | s37 Therapy catalogue | Have | Pass | ≈2 s | 16/16 |
| 36 | s38 Settings and attention rules | Have | Friction | ≈2 s | 15/16 |
| 37 | s40 Patient feedback and stories | Missing | Missing | — | — |
| 38 | s41 Therapist sees their day and marks done (after launch) | Partial | Friction | — | 14/16 |
| 39 | s42 Therapist records vitals and checklist (after launch) | Have | Pass | ≈10 s | 16/16 |
| 40 | s43 Therapist raises an issue (after launch) | Have | Pass | ≈3 s | 16/16 |
| 41 | s44 Therapist asks for leave (after launch) | Missing | Missing | — | — |
| 42 | s45 Doctor's round list and plan (after launch) | Partial | Friction | — | 13/16 |
| 43 | s46 Doctor fills the discharge summary (after launch) | Have | Pass | — | 16/16 |
| 44 | s47 Doctor prescribes from a medicine list (after launch) | Missing | Missing | — | — |
| 45 | s48 Patient sees their day and meals (after launch) | Have | Friction | — | 13/16 |
| 46 | s49 Patient fills their details before arrival (after launch) | Missing | Missing | — | — |
| 47 | s50 Patient gives feedback (after launch) | Missing | Missing | — | — |

### Third walk, 8 Oct (fresh trial centre, 375×812; a Sydney centre across its midnight)

Walked from a new trial centre built through the sign-up, the library and the Team sheets, at 18:10 to 20:30 IST (after closing). Score is before the fixes → after them; a story under 13 got one issue.

| Story | Wow | What the walk found | Issue |
|---|---|---|---|
| s6 Share by link and WhatsApp | 14 | Team, person, Share link, Send on WhatsApp: the phone and the line are filled in | none |
| s12 Order of a purification | 14 → 15 | warning right; only offered Book anyway | #528 |
| s15 Find | 13 → 14 | a guest room or a country found nobody | #525 |
| s20 Rooms tonight | 15 | read at a glance | none |
| s23 Medicines | 13 → 14 | the card's medicine retyped in the discharge summary | #524 |
| s37 Therapy catalogue | 15 → 16 | the before-a-purification rule was invisible | #528 |
| s38 Attention rules | 14 → 15 | Settings count wrong; an off rule said it counts | #526, #527 |
| s41 Therapist marks done | 12 → 14 | no Done tap | #522 |
| s42 Vitals | 14 | BP needs the full keyboard for the slash; the rest is a keypad | none |
| s43 Raise an issue, SOS | 13 → 16 | an SOS was grey, not counted, and invisible off the day | #521, #537 |
| s45 Doctor's round | 12 → 14 | the review sheet showed no facts; no way to plan with no review booked | #530, #523 |
| s46 Discharge from the link | 14 → 15 | medicines retyped; a bare '· ·' in the footer | #524, #542 |
| Other timezone | pass | Sydney at 23:57 to 00:01: the day, Print, the count and the links flip on the centre's clock; a guest's link read the phone's clock | #529 |
| First day | n/a | a therapy no room could host read 'Nothing is free…'; + after closing opened on the finished day | #544, #546 |

## Each story

Format: **Outcome** · **Trigger** · **First view** · **Wow** · **Fix** (the Audit track issue, or the smallest first step).

**1. s1 Morning glance: is today OK, and what needs me?.** Outcome: I know in 3 seconds whether I must act. Trigger: Opening the app, every morning and between jobs. First view: The Menu's count, or none. Wow: A calm day, or one sentence per problem with its fix as the button. Fix: #418 inbox grouped by cause, opened from the loaded check.

**2. s2 Fix the day when a therapist or room drops out.** Outcome: Everyone affected still has a treatment, and I can undo it. Trigger: A therapist calls in sick; a room floods. First view: Who, what breaks, and the whole plan as a preview. Wow: Two taps, about 6 s, the sheet right on paper. Fix: #409 planner reads weekly hours.

**3. s3 Print or share the day sheet.** Outcome: The notice board shows the right day. Trigger: Evening for tomorrow; morning after changes. First view: Menu, Print. Wow: Under 10 s to a correct PDF. Fix: 'Fix N first' on the toast when problems remain (#424).

**4. s4 Book or move a treatment.** Outcome: The patient has a treatment at a free time, and I stayed in control. Trigger: Doctor's round, a guest's request. First view: One sheet, search at the bottom, five suggestions. Wow: Returning patient in 4 taps, nothing typed. Fix: None.

**5. s5 Review a patient's week and plan the next.** Outcome: After the review, next week is booked and no day is empty by accident. Trigger: Weekly review, per patient. First view: Next days and the doctor's note on the card. Wow: Card, Plan next week, Book all: 3 taps for 7 days. Fix: #420 a starting week on day 1.

**6. s6 Share the day with staff by private link and WhatsApp.** Outcome: Each therapist knows their day without calling the office. Trigger: Morning and after any change. First view: Team row, Share link. Wow: One tap to send; the link always shows the current day. Fix: #413 Send on WhatsApp and Copy link.

**7. s7 Add an arriving patient.** Outcome: The patient is in, with a consultation booked, nothing forced. Trigger: Arrival at the desk, or a booking by email. First view: + on Patients, four fields. Wow: Under 60 s with the name; consultation already on the sheet. Fix: #424 toast at the top with Undo.

**8. s8 Doctor's consultation on arrival and the daily round.** Outcome: Every patient sees the doctor on day 1 and the round covers everyone. Trigger: Arrivals, and each morning's round. First view: The doctor's list for today. Wow: The round list prints itself. Fix: #423 Round on the doctor link.

**9. s9 Form C ready within 24 hours for a foreign guest.** Outcome: Every foreign guest is reported on time. Trigger: A foreign patient arrives. First view: Inbox item with the deadline. Wow: Every field filled; copied into the FRRO site in under 2 minutes. Fix: #415 nationality, visa, a due-by rule.

**10. s10 Record a therapist's leave.** Outcome: The leave is recorded and the day replanned if I want. Trigger: A leave request or a sick call. First view: Leave, +, who and dates, the consequence line. Wow: 4 taps; the replan opens filled in. Fix: #409; then people first in the picker (#424).

**11. s11 See who is in and when, and fix a gap.** Outcome: For any day I know who is in and where cover is thin. Trigger: Planning the week; before granting leave. First view: Team with the week strip. Wow: The gap line names hours and offers the fix. Fix: None.

**12. s12 Panchakarma order is kept.** Outcome: No therapy happens before the patient is prepared for it. Trigger: Booking or planning a purification patient. First view: A warning line in the booking sheet. Wow: The sheet says what the course needs and offers the order. Fix: #419 warn on before-purification after the purge.

**13. s13 Two-therapist and same-gender pairs held everywhere.** Outcome: A Pizhichil always has two trained therapists of the right gender. Trigger: Any booking or replan. First view: Nothing; the rule holds. Wow: Never seen; never wrong. Fix: Say why in the line (#424).

**14. s14 Kitchen gets the day's meals.** Outcome: The kitchen cooks the right thing for each patient. Trigger: Evening for tomorrow, after the round. First view: A kitchen page in the print menu. Wow: One A4: counts by plan per meal, then exceptions. Fix: #414 Kitchen sheet.

**15. s15 Find a patient or a fact.** Outcome: I find who or what I need in seconds. Trigger: A phone call, a question at the desk. First view: Search from the Menu. Wow: Two taps and three letters; the fact on the row. Fix: #412 patients first in typed results.

**16. s16 Set or change meals, by date.** Outcome: The kitchen cooks the right thing on each day. Trigger: After the doctor's visit. First view: Diet on the card. Wow: 3 taps; the sheet shows the change. Fix: Medication line wraps (#424).

**17. s17 Week ahead: arrivals, departures and empty days.** Outcome: I know what this week brings before it comes. Trigger: Monday morning, an enquiry. First view: The week strip with counts. Wow: In and out as two numbers under each day. Fix: #421.

**18. s18 Arrival steps checklist.** Outcome: Nothing a new patient needs is forgotten. Trigger: Each arrival. First view: Checklist bar on the card. Wow: '3 of 5 ready', each item opening its field. Fix: #422.

**19. s19 Change a stay.** Outcome: The dates are right and what followed them is tidy. Trigger: Guest extends or leaves early. First view: Stay on the card. Wow: 3 taps with a consequence line. Fix: None; date picker walked by hand (#425).

**20. s21 Day visitors and outpatients.** Outcome: A non-resident is booked like anyone else. Trigger: Walk-in or phone. First view: Add with Stays on site off. Wow: Same as an arrival, no room asked. Fix: None.

**21. s22 See and undo what changed.** Outcome: I can see who changed what, and put it back. Trigger: Something looks wrong on the sheet. First view: Log from Team. Wow: The change in words and its Undo on one row. Fix: #411 log every write.

**22. s23 Medicines on the sheet and to take home.** Outcome: Each patient gets the right medicine, on time. Trigger: Doctor changes a medicine. First view: Medication on the patient's page. Wow: Prints beside the patient's row. Fix: Wrap the line (#424); times after s47.

**23. s24 Discharge a patient.** Outcome: The summary prints, complete or not. Trigger: Leaving day. First view: Discharge bar on the card. Wow: 2 taps; blank lines to write by hand. Fix: None.

**24. s20 Room numbers and occupancy.** Outcome: I know who sleeps where and what is free. Trigger: Arrivals, enquiries, housekeeping. First view: Rooms by night. Wow: Free rooms in one glance. Fix: First step: a read-only 'Rooms tonight' list.

**25. s25 Passport or ID scan fills the patient.** Outcome: No passport is ever typed. Trigger: A guest with a passport arrives. First view: Scan passport on the add sheet. Wow: Point, check five fields, Add: under 20 s. Fix: First step: a photo kept on the patient.

**26. s26 Choose or change accommodation.** Outcome: Where the patient stays is recorded. Trigger: Arrival or a room move. First view: Accommodation on the card. Wow: Preselected from the package. Fix: None.

**27. s27 Prakriti and structured vitals.** Outcome: The doctor's assessment and readings are in one place. Trigger: Consultation; each treatment. First view: Doctor section on the card. Wow: Pulse and BP as a small trend. Fix: No '120/80' placeholder (#424); prakriti chips later.

**28. s29 Arrivals' details before they come.** Outcome: The guest fills their own details before arrival. Trigger: A booking is confirmed. First view: Send link from the new patient. Wow: Admin types nothing. Fix: First step: detail fields on the patient link before arrival.

**29. s30 Choose or change a package.** Outcome: The package is recorded and changeable. Trigger: After consultation. First view: Package on the card. Wow: 2 taps. Fix: None.

**30. s32 Follow-up after discharge.** Outcome: The guest hears from the centre when the doctor said. Trigger: Follow-up date passes. First view: Inbox item on the day. Wow: One tap to WhatsApp a prepared message. Fix: A 'Follow-up due' rule.

**31. s33 Classes and events (yoga, prayer).** Outcome: Classes are on the sheet and block the teacher. Trigger: Weekly pattern. First view: Events from Team. Wow: Set once a week; prints. Fix: None.

**32. s34 Re-book a returning guest.** Outcome: A returning guest starts where they left off. Trigger: A former guest books again. First view: Search, the old card, New stay. Wow: Previous plan offered as the start. Fix: #412, then 'New stay' on a past card.

**33. s35 Records for an inspection.** Outcome: I can hand over records when asked. Trigger: Inspection or audit. First view: Settings, Export records. Wow: One readable file per month. Fix: A 'Records for a month' PDF.

**34. s36 Set up the centre the first time.** Outcome: A new centre runs on day one. Trigger: Install. First view: Setup wizard. Wow: Under 10 minutes to a printable first day. Fix: None found.

**35. s37 Therapy catalogue.** Outcome: Every therapy carries its rules. Trigger: New therapy offered. First view: Therapies from Team. Wow: Add from the library, rules prefilled. Fix: None.

**36. s38 Settings and attention rules.** Outcome: The app fits the centre. Trigger: Setup or a policy change. First view: Settings rows that say their state. Wow: Each rule one switch. Fix: Open every day by default (merged as #398).

**37. s40 Patient feedback and stories.** Outcome: I hear what guests thought. Trigger: Leaving day. First view: Patient link. Wow: One question, read in the inbox weekly. Fix: First step: one question on leaving day.

**38. s41 Therapist sees their day and marks done (after launch).** Outcome: The therapist knows their day; the office knows it happened. Trigger: Each treatment. First view: Therapist link. Wow: One tap per treatment. Fix: Done per treatment; 'Day off' on a day off (#424).

**39. s42 Therapist records vitals and checklist (after launch).** Outcome: Readings are recorded where they happen. Trigger: After a treatment. First view: Therapist link. Wow: Numbers on a keypad, 10 s. Fix: None.

**40. s43 Therapist raises an issue (after launch).** Outcome: The office hears of a problem at once. Trigger: Something is wrong in the room. First view: Therapist link. Wow: One line lands in the inbox. Fix: Send one by hand (#425).

**41. s44 Therapist asks for leave (after launch).** Outcome: Leave reaches the rota without a phone call. Trigger: Planning time off. First view: Therapist link. Wow: Request lands with Approve and plan. Fix: 'Ask for leave' on the link.

**42. s45 Doctor's round list and plan (after launch).** Outcome: The doctor sees who to see and writes the plan once. Trigger: Morning round. First view: Doctor link. Wow: Plan turns into bookings with one tap. Fix: #423.

**43. s46 Doctor fills the discharge summary (after launch).** Outcome: The summary is the doctor's own words. Trigger: Leaving day. First view: Doctor link. Wow: Fields prefilled from the stay. Fix: None.

**44. s47 Doctor prescribes from a medicine list (after launch).** Outcome: Medicines are written once, the same way. Trigger: Consultation. First view: Doctor link. Wow: Pick from the list, dose chips. Fix: A medicine list in Settings.

**45. s48 Patient sees their day and meals (after launch).** Outcome: The guest knows where to be. Trigger: Each morning. First view: Patient link. Wow: Today's times, room and meals. Fix: Show meals with no treatment.

**46. s49 Patient fills their details before arrival (after launch).** Outcome: The guest arrives already registered. Trigger: Booking confirmed. First view: Patient link. Wow: Five questions and a photo. Fix: Covered by s29.

**47. s50 Patient gives feedback (after launch).** Outcome: The centre learns what to keep. Trigger: Leaving day. First view: Patient link. Wow: One tap and an optional line. Fix: Covered by s40.

# History: the 14 stories and the 1 Oct closing walk (#285)

Kept as the baseline the top 50 was ranked against; S1–S14 are now parents of rows above.

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
