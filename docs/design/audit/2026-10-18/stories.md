# Stories audit, 18 Oct 2026

Auditor: stories agent, stack :8219 (Babaji seed, then grown to 84 patients in house on Mon 19 Oct, 56 treatments, to test peak). Phone 412x915 at scale 2, touch, plus a 360x800 overflow check (no horizontal scroll on Day, Patients, Settings, Menu, Book; the Staff year strip scrolls on purpose). Sign-in by API token except once on the login screen (wrong password, then right: fine, plain message).

Time model: seconds = taps x 0.5 + characters x 0.3 + decisions x 1.35. Taps are exact counts of what I tapped from the Day screen with nothing else open. Native date fields count as 3 taps (open, pick, OK) on Android; I could not drive the real picker, so those are estimates and marked `~`.

Not every one of the 50 stories was re-walked. Walked this pass: s1 s2 s3 s4 s5 s6 s7 s8 (link) s9 (card) s10 s11 s14 s15 s16 s17 s18 s19 s20 s22 s24 s26 s33 s35 s38 s41 s45 (link) s48 (link) plus the peak jobs below. The others keep their 7-9 Oct score and are marked `carried`.

## Table: stories walked

Wow is old -> new, 16 points, bar 13 with no zero on lines 1, 3 or 6. Lines scored are mine; where a line moved I say why in the note.

| Story | Taps | ~Seconds | Human note (hesitate, remember, retype) | Wow |
|---|---|---|---|---|
| s1 Morning glance | 0 to see the Day, 2 for What needs you | 2.4 | Opens scrolled to "now": at 19:28 only the last 8 rows show, the week strip is hidden until you scroll up. Viewing Wed 21, the inbox still lists Arvind "not in today" under "TODAY'S STAFF" (stories-23). Day grouped by therapist says "all done" for Arvind though his rows say "Arvind was not in" (stories-40). | 13 -> 12 |
| s2 Fix the day, therapist out (6.45 am sickness) | 4: Staff, Asha, Not in that day, Save and fix; +1 Accept = 5 | 5.9 (reason 4 chars) | The plan reads in words ("Anjali Verma and Meera Nair, same time"), 5 s Undo toast. The admin must remember to tell the 3 patients (nothing does). Interrupted after "Save and fix": the leave is already saved, plan unaccepted; coming back and doing it again saves a second identical leave (Availability shows Asha twice, Log "Leave added" twice). Double tap on Accept was safe. | 8 -> 14 |
| s3 Print the day | Today 2 (Menu, Print); tomorrow 5 (Menu, Change day, Next day, Menu, Print); all five sheets +4 | 2.4 / 3.9 / 5.9 | Evening job needs 5 taps because Day opens on today until closing time. The toast with the other four sheets lasts 9.7 s. PDF downloads, the admin still has to open it and send it to a printer: not measured. Sheet verdict below. | 15 -> 14 |
| s4 Book or move | 6 to the time sheet (week, day, +, search, patient, therapy) +1 Book = 7 | 9.9 | "Same as last time" offers the last therapy (Mukha Lepam), not the doctor's plan ("Continue Abhyanga daily"); Abhyanga is under Other therapies. Date is a native date field. A closed day is handled well: "The centre is closed for Dussehra" with "Book Wed 21 Oct at 09:30" filled in (stories-19). | 16 -> 14 |
| s5 Review week, plan next | From the list 5 (Menu, Patients, row, Plan next week, Book all) | 3.9 | 1 patient = 5 taps, a ward round of 20 = 100 taps and one write each; no "plan everyone". Undo toast present. If a day in the range is closed it says "No free time on Thu 22 Oct" not "the centre is closed" (stories-53). | 15 -> 14 |
| s6 Share by link | 5 (Menu, Staff, row, Share their link, Send on WhatsApp) | 3.9 | Phone and line prefilled. One-off per person, then live. Ten therapists = 50 taps. Text "Name, your day at the centre, always up to date: <url>" is good. | 13 -> 13 |
| s7 Add arriving patient | 4 (+, name, gender, Add) +1 to close the card that opens = 5; 10 chars | 8.2 | After Add the new patient's card opens over the list, so the next arrival needs a Close first. 8 arrivals = 40 taps, about 65 s. The guest room is silently preset to the next free one (H2 · Huts) with no regard to package; at 84 in house it said "None free for these nights" with a chevron (text only). Back gesture (see F-3) strands the sheet. Double tap Add made one patient (good). | 15 -> 14 |
| s8 Doctor round (link) | Link opens on the round: 0-1 | 1 | Two names, "Plan ›". Read, not driven. | 13 -> 13 |
| s9 Form C | 3 (row, card, Form C) | 2.9 | "Due by Mon 19 Oct · 1 missing" is on the list row. Not driven to the end. | 15 carried |
| s10 Leave, with consequence | as s2 | 5.9 | "3 treatments that day will need another therapist." before saving: this is the consequence line the bar asks for. | 12 -> 15 |
| s11 Who is in | 2 (Menu, Staff) | 1.9 | Defaults to tomorrow after the evening; "10 in · 1 not in" and hours/booked per person. The year strip puts ~370 buttons in the page. | 15 -> 15 |
| s14 Kitchen | 5 (print path) | 3.9 | One A4, counts per plan per meal, 20 staying. No named exceptions or allergies on the page; seed has none to prove it. | 12 -> 13 |
| s15 Find | 2 + 5 chars | 3.9 | "aarohi d" and a room "T5" work. A phone number (stored "+91-9272863339") finds nobody in any form (92728, 9272863339, +91-...), and surname first ("das aarohi", "nair viv") finds nobody (stories-42). | 14 -> 12 |
| s16 Meals by date | 6 (Menu, Patients, row, Diet, plan, Choose) | 5.7 | Five plans of three lines each, the Choose button sits on the list (stories-43). The "Edit" for the current plan sits at the top and changes it for 15 patients. | 15 -> 13 |
| s17 Week ahead | 1 (week ›) | 0.5 | Counts under days (+2 -1). Not deep-walked. | 14 carried |
| s18 Arrival checklist | 2 (row, Arrival bar) | 1.9 | "1 of 5 ready", each item opens its field. | 14 -> 14 |
| s19 Extend a stay | 8~: Menu, Patients, row, Stay, 3 picker, Stay until | 5.4 | "3 days longer. Meals carry on to Fri 30 Oct. Package: 21 days; the stay is now 24." plus Undo. It says nothing about the room (next guest) or booked treatments after the old end. | 15 -> 15 |
| s19b Discharge early | 6 (Menu, Patients, row, Stay, Leaves today, Leave on) | 4.4 | "7 days shorter. 1 treatment after Sun 18 Oct will be marked cancelled..." Good. The room is not mentioned. | n/a -> 15 |
| s20 Rooms tonight | 2 | 1.9 | Guest rooms list names who is in / arriving / free. | 15 -> 15 |
| s22 Log and undo | 3 (Menu, Settings, Log) | 2.9 | Readable, "you" or "the app"; still no Undo on a row (#562). | 13 -> 12 |
| s24 Discharge | card -> Discharge summary 1-2 | 2.4 | Summary opens from What needs you ("Summary ›") once the stay ends. Printed result has two defects (F-6). | 16 -> 14 |
| s26 Accommodation | 3 | 2.4 | Reached; value "Not decided yet" for a patient 12 days in house. Seed point only. | 15 carried |
| s33 Events | 4 (Menu, Staff, scroll, Classes and events) | 3 | 13 events with times and who. | 16 -> 16 |
| s35 Records for a month | via Settings | - | PDF 11 pages for 127 stays; "No discharge summary / No treatments given this month" for stays that ended 1 Oct. Readable. | 14 -> 14 |
| s38 Settings | 2 | 1.9 | Rows say their state; "Opening hours" holds 40 timezone options in a list of hundreds (tz select). | 15 -> 15 |
| s41 Therapist marks done (link) | 1 per treatment | 0.5 | Each treatment carries 5 tick rows, 44 px, fine; a 6-treatment day is 30 rows. | 14 -> 14 |
| s48 Patient link | 1 | 0.5 | Today's times, room, meals; "Good / Not good" under each. | 13 -> 13 |

Carried (not re-walked, score as in STORIES.md): s12 s13 s21 s23 s25 s27 s29 s30 s32 s34 s36 s37 s40 s42 s43 s44 s45 s46 s47 s49 s50 s51 s52 s53, and the Missing ones (s31 dropped, s39 dropped).

Moved: s2 +6, s10 +3, s7/s3/s4/s5/s24/s16 down 1-3 for the reasons above, s15 -2, s1 -1.

## Peak jobs not in STORIES.md

| Job | Taps | ~Seconds | What happened |
|---|---|---|---|
| 8 patients arrive the same morning | 40 (5 each) | ~65 | Works, but the card opens after each Add. "Many at once? From a spreadsheet" exists; not tried. A 9th arrival met "None free for these nights". |
| Therapist off sick at 7 am | 5 | 5.9 | Best job in the app. Patients are not told. |
| Room floods (Shiva, tomorrow) | 5: Rooms, Shiva, Not available, Some days (+ 2 date fields ~6 taps), Save and fix | ~10 | Plan names the new room and therapists for 7 treatments. Unaccepted, the printed sheet says "ROOM OUT · ... Shiva (out)" beside each: honest. |
| Move a whole day (closure, Thu 22) | 8~ via Settings, Opening hours, Centre closed days, Close another day | ~8 | Nothing says what happens to the 24 booked treatments before you tap "Close the centre". Afterwards the day-check lists 24 as "The centre is closed for Closed." with no plan to move them. There is no "move this day to ...". |
| Patient extends stay | 8~ | 5.4 | s19 above. |
| Patient discharged early | 6 | 4.4 | s19b above. |
| Print 15 therapist sheets | 5 for the whole rota | 3.9 | One PDF, 3 pages at 20 patients, 4 at 84; one table of all therapists, no page per person. A per-person PDF exists on the server (staff_id) but no screen offers it, so the admin cuts the paper. |
| Print 50 patient schedules | 5 | 3.9 | The "patient sheet" is one landscape table of all patients grouped by diet plan: 3 pages (20 patients), 6 pages (84). Nothing a patient can be handed. Only the private link gives one person their day. |
| Hand the phone to a colleague | Menu, Settings, Sign out = 3, then sign-in typing | ~20 | No lock or PIN: whoever holds an unlocked app sees every patient. People with access lists 1 person; adding a colleague means typing an email and password. |
| Week-ahead planning | week strip 1 + per patient 5 | - | See s5; no list of "patients nobody has planned" to work through (day-check says 12 idle residents, the Menu pill does not). |
| Double-booked room | n/a | - | Cannot be made in the app: Book refuses with the nearest free time (not driven past the first refusal). |
| End-of-day review | 2-5 | 2-4 | Menu pill, Log, Print tomorrow. No "what changed today" summary beyond the Log. |
| Interruption and return after 5 minutes | - | - | Sheet drafts survive in memory only. A reload loses them. Sign-in token lasts (not tested to expiry). |

## Outputs: the printed sheets

Read with `pdftotext -layout`; fonts are Helvetica at roughly 7.5 to 8 pt on A4 landscape (bbox word height 8.3 pt).

| Output | Verdict |
|---|---|
| Day sheet (patients) | Correct names, times, therapists, rooms, diet block per plan, "ROOM OUT" and "NO THERAPIST" flags honest. Not a per-person page: one landscape table, 3 pages at 20 patients, 6 at 84, the same diet paragraph repeated under "(continued)" at every page break (4 times for one plan), and one empty row per patient with nothing booked (good). Small type for a notice board. Footer "Made with Ruta · try it free for 30 days" on every sheet in this trial centre. |
| Therapist rota | Correct and detailed (patient, room, oils and equipment, co-therapist "with Meera Nair"). One table of all therapists, not one page each; leave shown ("Asha Yadav Sick"). Events (yoga) appear as treatments for the therapist who leads them, which suits. At 84 patients, 4 pages. |
| Doctor rota | Right, 1 page. |
| Kitchen | Right: one A4 of counts per plan per meal (20 staying). No names and no allergy or exception lines; the 66 "No diet plan" patients of the peak data count as "the centre's usual food". |
| Guest rooms | Right and good: arrivals "Ready for Nisha Sharma", two guests in the apartments with dates. |
| Discharge summary | Layout good, medicines and diagnosis print. Two wrong things: "Discharged 18 Oct 2026, 11:00" and "Time: 11:00" when I discharged at 19:37, and "Admitted ... 09:00" (the times are made up); and "Special instructions" is prefilled with the doctor's last visit note ("Pain easing. Add Kati Vasti for 5 days; reduce oil in lunch.") on a patient who is leaving, which is advice for the stay, not the discharge. |
| Records for a month | 11 pages, one block per stay, plain. |
| WhatsApp / share text | `Name, your day at the centre, always up to date: https://host/l/<token>`, to the person's number with country code (10 digits become +91). Good. Patient and therapist links work without sign-in and show the live day. |

Verdict for a Babaji admin who prints today: the centre sheets are right and complete, but they are one big table, not the clear per-person page a therapist or a patient can follow, and the type is small. The app beats paper on correctness; it does not yet beat it on handing someone their own page.

## Slow 4G (CDP: 1.6 Mbps down, 750 kbps up, 150 ms) and offline

| Job | Seed 74 patients | 139 patients |
|---|---|---|
| Cold open of the Day | 3.5 s, 426 KB | 4.1 s, 579 KB |
| Reload of the Day | 2.5 s, 295 KB | 2.7 s, 354 KB |
| Menu | 0.24 s | 0.33 s |
| Patients list | 1.8 s, 112 KB | 1.3 s, 227 KB |
| Open a card | 0.23 s | 0.27 s |
| Plan next week | 1.2 s, 26 KB | - |
| Book all (write) | 0.2 s | - |
| Print patient sheet (toast up) | 1.6 s; the PDF itself 0.2 s, 9 KB | 0.1 s server |

Fine on slow 4G. The Patients list re-sends the whole list each visit (227 KB at 139 patients).

Offline (stories-55, stories-57): the Day already on screen stays. Changing day offline shows an empty Monday with "GET STARTED: Add your therapies / rooms / therapists / first patient, Not yet" and "Nothing booked on this day": it looks like a wiped centre. Reload offline is the browser's error page (no service worker). Adding a patient offline: the sheet keeps the name (good) but the tap shows nothing; underneath 85 to 89 toasts of the raw text "Failed to fetch" were created in 2.5 s at opacity 0, behind the sheet. DESIGN §6 says a failed save "says so, and retries": it does neither visibly.

## Findings, ranked

### F-offline-1 Lost signal looks like an empty centre and a silent save
Severity: blocks a job
Story: s1, s4, s7 (every job)
Steps: 1. Open the Day. 2. Go offline. 3. Menu, Change day, Next day. 4. Separately: Patients, +, type a name, Female, go offline, Add.
Saw: Mon 19 reads "Get started... Not yet" and "Nothing booked on this day"; the Add tap shows nothing, 85+ hidden "Failed to fetch" toasts (shots/stories-55-offline-nextday.png, shots/stories-57-offline-add-0.7s.png).
Why it matters to the admin: on hill-station signal they will think the centre has been wiped, or tap Add again and again. After signal returns a second tap could double-add.
Proposal: one calm banner at the top ("No signal. Nothing you see is lost. Nothing was saved.") when a read or write fails; keep the last good day on screen; one toast per failure with plain words; retry the save when the signal returns. Taps before -> after: n/a (confusion) -> 0. Cost: M.
REOPENS: none (DESIGN §6 Offline row is the rule being broken).

### F-print-1 No per-person page on any printed sheet
Severity: slows a daily job
Story: s3, s6
Steps: Print the day's sheets, open Therapist sheet, then Patient sheet at 84 in house.
Saw: one table for all therapists (4 pages), one for all patients (6 pages) at roughly 8 pt, the diet paragraph repeated "(continued)" on each page, trial footer. A per-person PDF exists (`staff_id`) but no button offers it.
Why it matters to the admin: Babaji hand each therapist and patient a page today. They will cut up the A4 or print 84 pages by reading each.
Proposal: in the Therapist sheet print one page per therapist (page break per person, 11 to 12 pt, names and rooms large); add "One page each" to the patient sheet; drop the repeated diet paragraph after the first page. Taps before -> after: 5 plus scissors -> 5. Cost: M.
REOPENS: none.

### F-day-1 Closing a day with bookings says nothing and offers no move
Severity: blocks a job
Story: new ("move a whole day's treatments"), s2
Steps: Settings, Opening hours and holidays, Centre closed days, Close another day, From/Until Thu 22 Oct, Close the centre. (Leave Reason empty.)
Saw: no line before the tap about the 24 booked treatments; afterwards day-check headline "The centre is closed for Closed", `plan` empty, 24 problems; the plan sheet for a patient says "No free time on Thu 22 Oct" instead of "closed" (shots/stories-47-closeday2.png, stories-50-closed-need.png, stories-53-plan-empty.png).
Why it matters to the admin: a retreat day or a power cut day is real at Babaji; 24 patients have a treatment on a closed day and the admin must move them one by one.
Proposal: a consequence line before saving ("24 treatments are booked that day") with a button "Save and move them" that opens the same one-pass plan as a leave; empty reason reads "Closed" without repeating; plan says "the centre is closed on Thu 22 Oct". Taps before -> after: 24 x 4 -> 3. Cost: M.
REOPENS: none.

### F-search-1 Search finds no phone numbers and no surname-first names
Severity: slows a daily job
Story: s15
Steps: Menu, Search; type 9272863339, +91-9272863339, 92728, "das aarohi", "nair viv".
Saw: "No upcoming treatments match" for each (shots/stories-42-search.png shows the working "aarohi" for contrast).
Why it matters to the admin: "A phone call, a question at the desk": callers give a number, and many Indian names are written surname first.
Proposal: match the digits of a phone number against the last 6 to 10 digits, and match every typed word anywhere in the name. Taps before -> after: no result -> 2 taps + 6 digits. Cost: S.
REOPENS: none.

### F-back-1 The back gesture leaves a sheet stranded
Severity: slows a daily job
Story: s7, all sheets
Steps: Menu, Patients, +, type a name, browser back.
Saw: the URL goes back to the Day but the New patient sheet stays open over it, name filled (shots/stories-63-back-with-sheet.png).
Why it matters to the admin: back is how a thumb dismisses a sheet on Android; here it changes the screen underneath without closing the sheet, and the + button is hidden.
Proposal: opening a sheet pushes a history entry and back closes the sheet first. Taps before -> after: 2 (find Close, tap) -> 0 extra. Cost: M.
REOPENS: none.

### F-arrival-1 The new patient's card opens after Add and blocks the next arrival; room is preset silently
Severity: slows a daily job
Story: s7 (8 arrivals)
Steps: Patients, +, name, gender, Add, then try + again.
Saw: the card (Arrival 2 of 4 ready, shots/stories-27-after-add.png) sits over the list, so a Close is needed each time; the Guest room field is preset to "H2 · Huts" for a patient whose package is not known; at 84 in house it reads "None free for these nights" with a chevron.
Why it matters to the admin: 8 arrivals at 6:30 am cost 40 taps instead of 32, and a wrong hut is booked unless the admin reads the row.
Proposal: after Add, toast "Kavita added, consultation Mon 10:30. Open card · Add another"; leave the room "Not yet" unless the package names a type. Taps before -> after: 5 -> 4 per arrival. Cost: S.
REOPENS: none.

### F-leave-1 A leave can be saved twice for the same person and day
Severity: annoys
Story: s2, s10
Steps: Staff, Asha, Not in that day, Save and fix that day, close the plan with Not now (interrupted), repeat.
Saw: Availability lists "Asha Yadav · Mon 19 Oct · Sick" twice (shots/stories-32-avail.png); Log shows "Leave for Asha Yadav added" twice.
Why it matters to the admin: after an interruption they cannot tell whether the first leave was saved; the second looks like a mistake they must delete.
Proposal: when the person already has a leave on that day, open that leave with its plan button instead of a new one. Taps before -> after: 7 -> 5. Cost: S.
REOPENS: none.

### F-discharge-1 Discharge PDF prints invented times and copies the stay note
Severity: slows a daily job (wrong paper)
Story: s24
Steps: Discharge PDF for a patient leaving today.
Saw: "Discharged 18 Oct 2026, 11:00", signature "Time: 11:00" while it was 19:37; "Admitted ... 09:00"; "Special instructions: Pain easing. Add Kati Vasti for 5 days; reduce oil in lunch." from the last visit.
Why it matters to the admin: a signed clinical paper with a made-up time, and an instruction that is not a discharge instruction.
Proposal: print the date only unless a time was recorded; prefill Special instructions blank (offer the last note as a tap). Taps before -> after: 0 -> 1 only if wanted. Cost: S.
REOPENS: none.

### F-inbox-1 Another day's inbox shows today's staff under "Today's staff"
Severity: annoys
Story: s1
Steps: Menu on Wed 21 Oct, What needs you.
Saw: header "Wed 21 Oct" then "TODAY'S STAFF · Arvind Iyer is not in today: Personal leave · Information" (shots/stories-23-wed-need.png).
Why it matters to the admin: the admin will read it as Wednesday's problem.
Proposal: label by the day in view, or show today's items only when in view. Cost: S.
REOPENS: none.

### F-day-2 "all done" under a therapist who was not in
Severity: annoys
Story: s1, s11
Steps: Show the day by Therapist on Sun 18 in the evening.
Saw: "Arvind Iyer · all done" above rows that say "Arvind was not in" (shots/stories-40-day-by-therapist.png).
Proposal: say "was not in · 4 treatments went uncovered" instead of "all done". Cost: S.
REOPENS: none.

### F-hol-1 Every public holiday ahead is already a closed day
Severity: slows a daily job (maybe)
Story: s38
Steps: Settings, Opening hours, Centre closed days.
Saw: 21 closed days including Dussehra Tue 20 Oct, Diwali, Christmas; Tue 20 shows 0 treatments and 12 idle residents, no word from the Menu.
Why it matters to the admin: a residential centre treats patients daily; the first surprise is a booking sheet that refuses Tue.
Proposal: see the question under "Needs the maintainer". Cost: S.
REOPENS: none.

### F-book-1 Booking suggests the last therapy, not the plan; evening opens on today
Severity: annoys
Story: s4
Steps: week, Tue 20, +, search, Aarohi Das.
Saw: "Mukha Lepam · Same as last time" while her plan says "Continue Abhyanga daily"; Date is a native field (shots/stories-19-book-time.png).
Proposal: offer the doctor's plan therapy first when there is one. Taps before -> after: 7 -> 5. Cost: S.
REOPENS: none.

### F-diet-1 Changing a diet is a wall of text with a nearby "Edit for 15"
Severity: annoys
Story: s16
Saw: five plans of three lines each; "Used by 15 patients · Edit ›" at the top of the same sheet (shots/stories-43-diet.png).
Proposal: plan names only, tap to expand; keep Edit away from Choose. Taps before -> after: 6 -> 5 and one fewer mis-tap. Cost: S.
REOPENS: none.

### F-target-1 Small touch targets
Severity: cosmetic, skip (listed for completeness)
Saw: Stays on site switch 51x31; therapy name inputs 51x31 in Plan next week. Everything else tested is 44 px or more.

Not found: double tap on Add patient (one made), double tap on Accept the plan (one plan), wrong password (plain message), 360 px overflow, rate limit during the UI tests. The server's write limit is 40 writes per 5 minutes per client (`RATE_LIMIT_WRITES`); my scripted loader hit it at once. A planning morning of 20 patients is 20 writes plus the arrivals: untested through the UI.

## Needs the maintainer

1. Should a residential centre start with the public holidays already closed, or open every day and let you close the ones you want? Answerable in app today: yes (Settings, Opening hours, Centre closed days).
2. Does Babaji print one page per therapist and one page per patient every day, or one sheet for the notice board? Answerable in app today: no.
3. Should the discharge summary print the real time of leaving, or the date only? Answerable in app today: no.
4. When a therapist is off sick, should the app also send a note to the patients who move? Answerable in app today: no.
5. Should the app ask for a PIN or fingerprint before showing patients when the phone is handed to someone? Answerable in app today: no.
6. When a day is closed for a retreat, should the 20-odd treatments move to the next open day automatically with one Undo? Answerable in app today: no.
7. Is the type size on the notice-board sheet readable for your oldest therapist at 8 pt? Answerable in app today: no (print the Day sheet and look).
