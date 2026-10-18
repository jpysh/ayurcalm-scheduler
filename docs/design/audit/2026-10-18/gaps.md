# Gap-fill audit, 18 Oct 2026

Stack :8220 (project audit18c, `SEED_SIZE=babaji`, `RATE_LIMIT_WRITES=100000 RATE_LIMIT_CALLS=100000`), plus a fresh default stack :8221 (project audit18d) for Setup and Settings. Both torn down at the end. 412x915 at 1.5x, 360x800 for first views. Centre clock was about 21:10 to 21:45 IST, after the 20:00 closing, which shapes several results below.

## Which limiter blocked the first pass

Not a link-only limit. The link routes sit under `/api`, so they share two limiters (`server/src/index.ts`): `globalLimiter` (line 115, `RATE_LIMIT_CALLS`, default 1200 per 15 min per address, every `/api` call including reads of `/api/public/link/...`) and `writeLimiter` (line 122, `RATE_LIMIT_WRITES`, default 40 per 5 min, every POST/PUT/DELETE, which includes "Send link", `POST /patients/:id/link`). Both were lifted by env here; the link page opened with 200 first time. Third, NOT liftable by env: `apptPostLimiter` (line 123, 10 booking POSTs per minute per address, hard-coded). Loading 55 patients' bookings hit it; I had to pace one booking per 6 s.

## Coverage

| Gap | Done | Could not |
|---|---|---|
| 1 Link page | Patient (37 treatments over the week, stay of 21 days) and therapist (9 treatments) at 412 and 360, every scroll, details sheet with bad input, past day with thumbs, 200% text, SOS sheet, wrong token, lapsed 31 days, 29-day edge, returning guest, print to PDF (patient 1 page, therapist 5) | Real WhatsApp preview of the link; a guest on a real cheap phone (only CSS emulation); `?date=` is ignored by the page, so past days need taps |
| 2 Clock | Server timezone setting switched to Etc/GMT+9, +4, -6 so the centre clock read 06:43, 11:43, 21:43 with the browser in the same zone; Day screenshots at 412 and 360 | The seed has no treatment before 09:00, so "early treatments visible without scrolling" is untested; "today" date could not be moved off 18 Oct; Playwright clock not used because the server clock decides "now" |
| 3 Peak | 72 in house (74 on the kitchen sheet counting leavers), 44 guest rooms, 17 staff (15 working), 51 treatments today. Day in all four groupings, Patients, Search, Attention, guest rooms, Staff, Log; PDFs (patient 7 pages, therapist rota 3, kitchen 1, guest rooms 2, one therapist 1); slow 4G (1.6 Mbps, 150 ms) with 4x CPU throttle | Only 51 treatments, not 70+: the booking POST limit and holiday/slot refusals (20 Oct is a holiday and a course spanning it was refused whole, `CENTER_HOLIDAY`) made more too slow. 55 of 72 patients have no diet plan or notes, which inflates Attention and the kitchen sheet |
| 4 Log | 118 entries, 8.8 screens | Undo per row: no row of that kind exists here (bookings have none, only replans do) |
| 4 Setup | Wizard 2 steps, then "Make it mine" 3 steps to the end (Finish without patients); long centre name | Pasted-sheet patient step: my fill did not reach it, unverified; CSV file upload not driven |
| 4 PDFs read | Patient, therapist, kitchen, rooms read as text for content | Doctor sheet (1 page, not read), discharge PDF |
| 4 Native date/time | Setup hours and card use `select`s; link details uses a plain text box | Android Chrome picker cannot be emulated headless; I cannot say what it shows |
| 4 Settings inputs | Centre (long name, address, email, website, currency), hours (close before open), account email; 200% text on 14 sheets | Package/accommodation/people sub-forms with bad values, Backups load |
| 4 Landscape | Day and a treatment card at 915x412 | Other screens |

## First pass claimed but I found missing or off

- "Day opens in 3.5 s on slow 4G" (AUDIT.md): with 72 in house I measured 5.0 s to first content (slow 4G plus 4x CPU, which a mid phone is). Without the CPU throttle it would be nearer; the claim was for the 20-in-house seed.
- Settings listed "fine" with copy issue only (screens.md): no input had been given a bad or long value. Findings F-G-9 and F-G-10 come from doing so.
- "Peak" readout said 8 guest rooms; I raised to 44 and the screens held, but the Attention sheet did not (F-G-1).
- Link page, Day at 06:30, a stressed Log and Setup past step 1: the list in AUDIT.md "Not covered" is now closed except as marked above.

## Findings, ranked

### F-G-1 Attention at peak: the urgent staff item sits under 55 patient rows
Severity: slows a daily job
Story: s2, s10
Steps: 1. Load 72 in house (55 without diet plan or arrival notes). 2. Menu. 3. "55 need you".
Saw: sheet is 3,436 px, 3.8 screens. Headings are PATIENTS then STAFF; "Arvind Iyer is not in today: Personal leave" is last. 52 rows read "Arrival notes not written · No diet plan" (shots/gaps-load-attention.png, gaps-load-menu.png). The one row that needs a decision this minute is the one furthest away.
Why it matters to the admin: at 7 am the first job is "who is off". Standing with a phone, she scrolls 4 screens of identical rows.
Proposal: staff problems and anything that makes today's treatments fail go first; identical reasons collapse into one row ("52 guests: no diet plan, no arrival notes", tap to list). Taps before -> after: 1 menu + 1 + about 4 scrolls -> 2, no scroll. Cost: S.

### F-G-2 A dead guest link says nothing about who to ask
Severity: annoys
Story: none
Steps: open `/l/<wrong>`, or a link 31 days after the stay (shots/gaps-link-wrongtoken.png, gaps-link-lapsed.png).
Saw: one grey sentence at the top of an empty page: "This link is no longer valid. Ask the centre for a new one." No centre name, no phone, no WhatsApp. A typo, a lapse and a revoke look identical. 29 days after the stay still opens; 31 does not (checked). A returning guest's old link is dead the moment a new stay is saved, even a recent one: they get the same sentence.
Why it matters: the guest cannot tell which centre "the centre" is if the link came forwarded.
Proposal: the 404 carries the centre name and the reception WhatsApp already used on the live page; show "Babaji Ayurveda" and a WhatsApp button. Taps for the guest 0 -> 1 to reach the centre (today: impossible from the page). Cost: S.

### F-G-3 The guest sees one day; a week is 7 taps and prints as one day
Severity: slows (guest) / annoys
Story: s15 paper replacement; links to #932
Steps: open the link of a guest with 37 treatments over the week; tap › to move through days.
Saw: opens on one day only (Mon 19 because after 20:00 closing), 981 px at 412 (2.4 screens with meals); no week view. Print to PDF is 1 page for that day, and carries the arrows, "Back to today" and "Your details 1 of 7 filled in" (print text in gaps-link-patient-full.png). `?date=` is ignored. Readability is good: 16 px body, 412 and 360 no overflow, 200% text wraps cleanly (gaps-link-patient-200.png).
Why it matters: a guest on the door slip wants the week; Babaji prints per-person pages today (AUDIT.md item 2).
Proposal: a "This week" section below the day: one line per treatment, grouped by day, from the same endpoint; this is also the printable per-patient week (#932) with no new screen. Taps (guest) 7 -> 0. Cost: M.

### F-G-4 Guest details: a bad value does not say which
Severity: annoys
Story: none
Steps: link > Your details > phone 250 characters, DOB "31/02/1980" > Save my details.
Saw: toast "Not saved. Check what you typed and try again." over the form, no field marked (shots/gaps-link-details-bad.png). Date of birth is a free text box labelled "(yyyy-mm-dd)"; an Indian guest types dd/mm/yyyy.
Proposal: use a date input (native picker on Android) and name the field in the toast. Cost: S.

### F-G-5 Therapist link: 9 treatments is 5.4 screens and the SOS is at the bottom
Severity: slows a daily job
Story: therapist day
Steps: therapist link, 360 wide.
Saw: page 5,468 px; "Raise an issue or SOS" at y 5,316, the last control (shots/gaps-link-therapist-full.png, gaps-link-sos-360.png). Every treatment shows 3 ticks, vitals, Done and Room ready unfolded until Done is tapped. Done then folds the row to one line (good, shots/gaps-link-done-360.png).
Proposal: show only the next treatment unfolded, the rest one line; keep SOS pinned at the bottom of the screen. Scroll for the next job 5 screens -> 0; SOS 5 screens -> 0. Cost: M.

### F-G-6 A row in "Tell the centre" sends at once, SOS included
Severity: annoys (unsafe result: false alarm or empty note)
Steps: therapist link > Raise an issue or SOS > tap any row.
Saw (code, `src/pages/LinkView.tsx`: each Row's onClick calls `sendIssue`; the sheet is shots/gaps-link-sos-360.png, rows "Need permission / A note for the admin / SOS: need help now", all "Send ›"): the note box sits above the rows, so tapping "A note for the admin" before typing sends an empty note, and a stray thumb on SOS alerts the centre. I did not tap SOS on the live stack.
Proposal: a Send button under the note; SOS asks "Send SOS?" once. Taps 1 -> 2 for SOS only. Cost: S.

### F-G-7 Day after closing opens at the "End of the day", the rest of the app has moved to tomorrow
Severity: slows
Story: evening review
Steps: centre clock 21:43 (timezone setting Etc/GMT-6) open Day; 06:43 and 11:43 for comparison.
Saw: 21:43 and 21:17 open on the bottom of today, one marker and "End of the day" (shots/gaps-clock-2141-412.png, gaps-setup-5.png, also the landing after Setup). Staff opens "17 in on Mon 19 Oct", the link page opens tomorrow, Menu offers "Print tomorrow's sheets". At 06:43 Day opens scrolled 134 px so the "Arriving · Riya K. / Leaving ·" line and the 51-treatments summary are off screen (shots/gaps-clock-0641-412.png); at 11:43 it is a full screen down (3,185 px page) and the summary is gone. "Now" itself is right in all three (06:43, 11:43, 21:43 matched the zone).
Why it matters: the evening admin sees an empty screen that says nothing about tomorrow. Morning: arrivals today are the first glance and are hidden.
Proposal: after closing open on tomorrow (as the others do); scroll to "now" but keep arrivals and leavers pinned under the title. Cost: S. Not settled in a decision file I found; check #546/#662 wording.

### F-G-8 Booking 10 an minute cap, not lifted by env
Severity: slows a daily job at peak
Steps: book 12 arrivals' courses in a row (one POST each).
Saw: `apptPostLimiter` (10 per minute) returned "Too Many Requests" (a8 call). The write limiter of 40 per 5 min is noted in AUDIT.md; this one is tighter and unmentioned. Ten arrivals with two therapies each hit it in under a minute.
Proposal: raise to 60 per minute and have the toast say how long to wait. Cost: S.

### F-G-9 Settings accept invalid contact values and raw validation text
Severity: annoys
Steps: Settings > Centre and letterhead: name 400 characters > Save. Email "not an email", website "javascript:alert(1)", currency "ABCDEFGH" > Save.
Saw: name: toast "Too big: expected string to have <=120 characters" (raw, no field). Email, website saved as typed; currency silently cut to 4 characters. They print on the letterhead. Hours: closing before opening is refused with "Closing time must be after opening time" (good). Address 400 characters accepted and prints (shots/gaps-set-centre-long2.png).
Proposal: name the field, check email and website shape. Cost: S.

### F-G-10 Make it mine: names separated by commas become one person
Severity: annoys
Steps: /setup/mine, Therapists box: "Priya Patel", newline, "Meera Nair, Asha".
Saw: four Woman/Man pairs, not five; "Meera Nair, Asha" is one therapist. Each person needs a gender tap (4 taps for 4 people), Continue stays grey with "Choose Woman or Man for each person" (good hint). Patients step takes a pasted tab-separated sheet or a CSV file only; its error handling is unverified.
Proposal: split on commas too. Cost: S.

### F-G-11 Peak lists: Patients 7.2 screens, Day 4.3 to 5.2, patient sheet 7 pages
Severity: annoys (known F-S-1)
Saw: Patients 7.2 screens (6,626 px, 77 rows) with no search box; Day by time 4.3, therapist 4.9, room 4.2, patient 5.2; Log 8.8 screens for 118 entries (cap 500 in `changeLog.ts`, shown as "Last 30 days" with no notice at the cap); Search for "Ash" is fast and groups Patients, Not available, then treatments. Slow 4G with 4x CPU: first Day content 5.0 s. Landscape Day shows about three rows (shots/gaps-landscape-day.png): skip.
Printed: patient sheet 7 pages (grouped by diet plan, not alphabetical, diet text repeated each page), therapist rota 3 pages, kitchen 1, guest rooms 2, one therapist 1. All readable as text; "NO THERAPIST ... Arvind Iyer (off)" and "Needs a therapist: booked with someone who is off" are clear. To find "Aarohi Das" on 7 pages the admin scans by diet group.
Proposal: alphabetical index line at the top of the patient sheet ("Aarohi Das p1, ..."). Cost: S. Footer "Made with Ruta · try it free for 30 days" prints on every sheet and guest page (known).

## Cosmetic, skip

- Fresh stack timezone preselects the phone's zone (Europe/Prague in the test browser), correct on a real phone in India.
- 200% text: no horizontal overflow on 14 sheets, Save stays pinned (803 to 891 px); the Centre sheet shows about 2.5 fields at a time.
- Landscape card fits (362 px high at 412).
