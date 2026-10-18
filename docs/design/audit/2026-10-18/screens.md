# Screens audit, 18 Oct 2026

Stack :8218 (seed has 20 in house, 57 treatments today; I added about 47 day patients and 20 extra treatments through the API to look at a heavier day, so "41 need attention" below is partly my own data). 412x915 at 1.5x, plus 360x800 first views (shots/screens-360-*). Scroll depth is document height in screens at 412x915. Taps are from Day.

Limits of this pass: the clock was 19:30, so I never saw the Day at 06:30 (it opens scrolled to "now", see F-S-4). The patient link page (/l/:token) could not be opened: my own bulk loading tripped the write rate limit and the link call kept returning 429, so the link page is unverified. PDFs were read as text only for structure (another auditor owns the sheets).

## Inventory

| Screen | Taps from Day | Scroll depth | Inputs | Actions | Verdict |
|---|---|---|---|---|---|
| Login (/login) | n/a | 1.0 | email, password | sign in, forgot password, help | fine |
| Setup (/setup), Make it mine (/setup/mine) | 1 (banner) | 1.0 | centre name, address, doctors, therapists | continue, not now | fine; not walked beyond step 1 |
| Day, by time | 0 | 3.5 (20 in house) to 5+ (57 treatments) | none | week, regroup, tap row | works; no jump to an hour (F-S-4) |
| Day, by therapist / room / patient | 1 | 5.0 / 4.6 / 5.5 | none | tap row | works; grouping button scrolls away (F-S-4) |
| Week strip | 1 | n/a | none | pick day | fine, shows +arrivals/-leavers |
| Treatment card | 1 | 1.0 | none | open card, move, history | fine |
| Menu | 1 | 1.0 | none | 7 tiles, search, change day, print | fine |
| Change day | 2 | 1.0 | date | day before/today/next, picker | fine |
| Print sheets (menu or sheet list) | 2 | 1.0 | none | patient, therapist, doctor, kitchen, rooms | works; no per-patient week sheet (F-S-2) |
| Attention sheet | 2 | 1.4 | none | Diet, Treatments, Dismiss, open card | fine at 1; see F-S-6 at 40 |
| Search | 2 | 1.0 | one box | chips of patients and therapists | fine |
| Patients list | 2 | 2.9 (67 rows) | none (no search box, no filter) | In house / Needs attention, gear | F-S-1, F-S-6 |
| Patient card | 3 | about 2.5 | none | 12 rows, plan next week | long but ordered well |
| Card: Diet / Stay / Package / Accommodation / Details / Discharge / Private link / Next week | 4 | 1 to 2 | dates, selects, 12 text fields | save | fine; discharge print is a good paper replacement |
| New patient | 3 (plus) | 1.5 | name, gender, dates, room, consult | Add patient | F-S-3 |
| Book a treatment (plus on Day) | 1 | 1.0 | who | recent list, search | fine |
| Staff | 2 | 1.5 | none | week strip, tap person | fine |
| Staff card (not in, late, early, away, link) | 3 | 1.0 | times | each row | fine |
| Add therapist or doctor | 3 | 2.0 | name, role, gender, hours, therapy ticks | save | fine |
| Therapies | 3 (Staff, bottom) | 2.5 (40) | none | library, add, edit | hidden under Staff (F-S-7) |
| Classes and events | 3 (Staff, bottom) | 1.5 | name, 15-minute selects | add, edit | hidden under Staff (F-S-7) |
| Rooms and room card | 2 | 1.0 | none | not available, details | fine |
| Availability (time off) | 2 | 1.5 | dates, reason | add, available again | fine |
| Guest rooms | 2 | 1.9 | arriving/leaving pickers | tap a room | fine |
| Diet plans and plan card | 2 | 1.0 | 10 meal boxes | save, retire | fine |
| Settings and 10 sections (needs you, printed sheets, people, centre, hours, catalogues, backups, log, account, help) | 2 and 3 | 1 to 2 | many | save | fine; copy issue F-S-8 |
| Log | 4 | long | none | undo | present; not stressed |
| 404 | n/a | 1.0 | none | back to the day | fine |
| Patient link (/l/:token) | n/a | not seen | none | none | UNVERIFIED |

Small targets (under 44 px) in first views: none flagged by the script on any screen at 412 or 360. No horizontal overflow anywhere, including 360 and 200% text.

## Paper the admin still does today

- A per-patient week slip (what each guest gets on the door). The card has "Share their day" by WhatsApp link only; nothing prints one patient's week. See F-S-2.
- The arrivals checklist: "Arrival notes not written" is a flag per patient with no list to work down.
- Staff attendance: the Staff screen shows who is in today but nothing for a morning roll call beyond that.

## Peak (about 70 in house) readout

Patients list stays one flat list, no search on the screen, no alphabet jump: 67 rows is 2.9 screens, 100 would be about 4. It is usable but every lookup costs menu, Search, type. Day is 5 screens at 57 treatments, so about 15 screens at 200 treatments with no way to jump to 14:00. The attention pill showed 41 identical rows. The 8 guest rooms in the seed are not a peak test; I could not test 70 on-site residents.

## Findings, ranked

### F-S-1 Patients has no search and no jump on a long list
Severity: slows a daily job
Story: none
Steps: 1. Menu. 2. Patients (67 rows). 3. Look for "Zara".
Saw: header has only "In house / Needs attention" and a gear; scroll 2.9 screens (shots/screens-patients-top.png). Search exists only in the Menu.
Why it matters to the admin: Asking "which room is Zara in" mid-interruption means leaving the list, opening Menu, tapping Search, typing. At 70 in house the list is the first thing used.
Proposal: put the search box at the top of the Patients list (same component as Menu search). Taps before -> after: 4 -> 2. Cost: S.

### F-S-2 No printable week for one patient
Severity: slows a daily job
Story: none
Steps: 1. Patients. 2. Open Aarohi Das. 3. Look for Print.
Saw: card rows are Diet, Stay, Package, Accommodation, Photo, Details, Discharge summary, Private link (shots/screens-patientcard.png). Only the discharge summary prints. The patient day sheet is one grid grouped by diet plan, 5 pages at 20 in house.
Why it matters to the admin: Today they hand a printed schedule to each guest. A guest without a smartphone gets nothing from "Share their day".
Proposal: add "Print their week" to the card, opening a one-page PDF of the next 7 days. Taps before -> after: paper by hand -> 2. Cost: M.

### F-S-3 A long name wrecks the New patient button and form
Severity: annoys (blocks the submit in a keyboard-sized viewport)
Story: none
Steps: 1. Patients, plus. 2. Type a 120-character name with the keyboard up (viewport 615 px). 3. Pick Female.
Saw: the green button grows to four lines and takes the lower third of the sheet; the name box scrolls sideways (shots/screens-kb-newpatient-longname.png). Name length is not limited. Add also fails silently if the write rate limit is hit: a toast "Too many changes at once, so nothing was saved" over the button (shots/screens-newpatient-after-add.png).
Why it matters to the admin: A mis-paste or long foreign name hides the form's fields behind the button.
Proposal: button label "Add patient" fixed; cap name at 80 characters with Zod and a counter at 70. Taps: 0. Cost: S.

### F-S-4 Day opens at "now" and the regroup control scrolls away
Severity: annoys
Story: none
Steps: 1. Open the app at 19:30. 2. Try to switch to By therapist.
Saw: list opens at 16:00 hour; "By time" button is in the scrolling header and not visible (shots/screens-day.png). The button's accessible name is "Show the day by, now Time", so the visible label and spoken label differ. No hour jump for 57 treatments (5 screens).
Why it matters to the admin: Review the morning, or change grouping when a therapist asks "what is Raj doing": scroll up the whole day first.
Proposal: keep the grouping control in the sticky date line; add a tap on the hour header to jump back to the top. Taps before -> after: 1 + long scroll -> 1. Cost: S.

### F-S-5 Offline and API-down look like an empty centre
Severity: fix a wrong result
Story: none
Steps: 1. Open Patients. 2. Cut the network (or stop the API) and reload.
Saw: "Changes may not save. The centre's database is not answering." above "0 in house. No one is staying today. Add a patient" (shots/screens-apidown-reload.png). Offline with the page already loaded: Staff opens from cache with no sign it is stale (shots/screens-offline-staff.png).
Why it matters to the admin: On patchy 4G "No one is staying today" at the start of the day is wrong and alarming; they may add a patient twice.
Proposal: when the load failed, replace the empty state with "Could not load. Try again" and a retry button; hide Add a patient. Taps: 0 -> 1 retry. Cost: S.

### F-S-6 The attention list repeats one problem for every patient
Severity: slows a daily job
Story: none
Steps: 1. Menu. 2. Patients. 3. Needs attention.
Saw: 41 rows all reading "Arrival notes not written · No diet plan" (shots/screens-patients-filter.png); pill shows 41 on the Menu button.
Why it matters to the admin: On arrival day at the centre, 15 to 20 patients arrive; each needs a diet plan. Fixing is one patient at a time (open card, Diet, choose).
Proposal: on a repeated reason offer "Set diet for all arriving today" with a plan picker, or sort the list by reason. Taps before -> after: about 4 per patient -> 2 for a group. Cost: M.

### F-S-7 Therapies and Classes and events sit at the bottom of Staff
Severity: annoys
Story: none
Steps: 1. Menu. 2. Staff. 3. Scroll to the bottom. 4. Therapies.
Saw: the menu has no entry for either; they are the last two rows of the Staff list (shots/screens-staff-bottom.png, screens-therapies.png). Nothing in Menu or Settings says where they are.
Why it matters to the admin: Adding a therapy or moving yoga is a weekly job in a new centre; a receptionist will not look under Staff.
Proposal: add "Therapies" and "Classes and events" as rows in Settings ("Your centre"), keep the Staff rows. Taps before -> after: unchanged (4); findability only. Cost: S.

### F-S-8 Wrong or odd words in Settings
Severity: cosmetic, skip
Story: none
Saw: Backups says "MOVE TO ANOTHER RUTA" and the printed sheet footer says "Made with Ruta" while the app is called AyurCalm (shots/screens-settings-backups text). The "Opening hours" selects list every half hour from 00:00 (48 options). 200% text: the menu count badge ("31") overlaps the Menu button and Day rows wrap to a 6-line therapist name (shots/screens-text200-day.png, screens-text200-menu.png).

### F-S-9 Write rate limit shows no way back
Severity: slows a daily job
Story: none
Saw: after about 60 quick writes every write returned 429. The sheet toast reads "Too many changes at once, so nothing was saved. Wait a few minutes" and the form stays open (shots/screens-newpatient-after-add.png). The default limit is stricter than a real 70-patient arrival morning (one person adding many patients and bookings).
Proposal: raise the default, or show how long to wait. Cost: S. Verify against the real limit in server code before changing.
