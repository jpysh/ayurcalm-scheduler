# Stays and guest rooms: real-life situations (26 Oct 2026)

**190 situations: 65 handled, 47 gaps (32 on the twelve filed issues #1186–#1197, 15 unfiled), 78 unknown.** Out-of-scope items are listed at the end, not counted.
The strong parts: double booking, rooms out of use, moving rooms from a date, Form C, leave and re-planning, diet and discharge.
The weak parts: anything that pauses or shifts a stay (#1193, #1194), companions and meal counts (#1195), and groups (#1196).
Walk these unknowns next, highest first: **1** early arrival, **16** early departure, **29** stay moved before arrival, **36** undo of a date change, **96** doctor changes plan mid-stay, **120/121** free rooms by date range, **138** two phones editing one stay, **169** signal lost mid-save, **171** double tap on save, **8** consult before treatments.
Each unknown that turns out broken gets its own issue; one that works becomes Handled here.

What this is: the situations a residential centre like Babaji Ayurveda (Ranikhet, about 25 rooms in Trishul and Nanda houses, apartments and huts; Panchakarma of 3 to 45 days; one or two groups of 10 to 30 a month; one admin on up to two phones) meets around stays and guest rooms, and how the app copes today. It grows the 64 situations in the research note of the same day.

"Today in the app" was judged by reading the code (`server/src/server.ts`, `guestRooms.ts`, `attention.ts`, `prisma/schema.prisma`) and the decisions folder, not by walking the running app. **Unknown** means the code did not settle it; walk it before building anything. **Gap (no issue)** means nothing is filed yet. Priority: High = will happen in the first month at Babaji; Med = will happen in a season; Low = rare.

## Arrivals

| # | Situation | Best-in-class handling for a phone-only admin | Today in the app | Priority |
|---|---|---|---|---|
| 1 | Guest arrives a day early | Move the start date back; app says whether the room is free that night and offers free rooms if not | Unknown | High |
| 2 | Guest arrives a few hours late; morning treatments missed | One tap "arrived late, from 15:00"; day re-planned around it | Unknown | High |
| 3 | Guest arrives days late (train cancelled, road closed) | Shift the whole stay or shorten it, treatments move with it; room nights before arrival released | Gap → #1193 | High |
| 4 | Guest never arrives | "Did not arrive" frees room and treatments, with Undo | Handled (did-not-arrive with undo) | High |
| 5 | Guest arrives after reception has closed | Room and arrival note visible on the day sheet for the night watchman | Unknown | Med |
| 6 | Room not ready when guest arrives | Room "being cleaned" state; admin sees which rooms are ready | Gap (no issue) | Med |
| 7 | Walk-in with no booking | From the vacant-room list, create guest and stay in one go | Unknown | High |
| 8 | Nadi Pariksha consult must come before any treatment | Arrival consult booked first; treatments cannot start before it | Unknown | High |
| 9 | Guest brings an extra person not booked | Add companion to the room; beds checked | Gap → #1195 | Med |
| 10 | Pickup needed from Kathgodam station | Transfer note on the arrival list | Gap (no issue) | Low |
| 11 | Arrival notes (vitals, concerns, tests) taken on arrival | Arrival form on the stay | Handled (arrival PATCH; vitals, concerns, tests) | High |
| 12 | Returning guest books again | Find by name or phone; new stay on the same record, room chosen | Gap → #1190 | High |
| 13 | Two guests with the same name | Phone or date of birth shown to tell them apart | Unknown | Med |
| 14 | Guest arrives with no ID or passport copy | Stay starts; missing ID flagged until added | Unknown | Med |
| 15 | Arrival day is already full for therapists | Warning when booking the stay, not on the day | Unknown | Med |

## Departures

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 16 | Early departure (family emergency, did not like it) | Shorten the stay; later treatments and room nights freed | Unknown | High |
| 17 | Extension mid-stay, room free | Lengthen; room check on the new nights | Handled (room check on stay change, ROOM_TAKEN) | High |
| 18 | Extension mid-stay, room booked by the next guest | Offer a move from that night, or a different room for the newcomer | Gap → #1192 | High |
| 19 | Late checkout | Leaving time on the stay; clash with the next arrival shown | Gap (no issue) | Med |
| 20 | Treatments booked after the guest leaves | Warn when the stay end cuts off treatments | Unknown | Med |
| 21 | Guest leaves for a weekend and comes back | Pause the stay, keep or release the room | Gap → #1194 | Low |
| 22 | Discharge summary at departure | Summary written and printed as PDF | Handled (discharge and discharge PDF) | High |
| 23 | Take-home diet and medicine list | Part of the discharge summary | Unknown | Med |
| 24 | Discharge summary not started the day before | Reminder | Handled (rule "leaves tomorrow", off by default) | Med |
| 25 | Follow-up call after discharge | Reminder until marked done | Handled (follow-up rule and mark done) | Med |
| 26 | Guest feedback on the stay | Short good / fine / not good answer, poor flagged | Handled (feedback rules) | Low |
| 27 | Room turned over the same day for an arrival | Departures and arrivals per room on one list | Unknown | Med |
| 28 | Guest leaves without saying goodbye | Mark left today; rest of stay cleared | Unknown | Low |

## Date changes

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 29 | Guest moves the whole stay a week later before arriving | Move both dates; treatments and diet move too; room re-checked | Unknown | High |
| 30 | Stay shortened before arrival (7 days to 5) | Last days' treatments removed, room nights freed | Unknown | High |
| 31 | Doctor extends the course mid-stay (14 to 21) | Extend; plan for the extra days offered | Unknown | High |
| 32 | Date typed wrongly (2025 for 2026) | Clear confirmation of nights and dates before saving | Unknown | Med |
| 33 | Stay end before stay start | Refused with a plain message | Unknown | Med |
| 34 | Two stays for one guest overlap | Refused or merged | Unknown | Med |
| 35 | Change preview before saving | Show what moves before the admin saves | Handled (stay preview endpoint) | High |
| 36 | Undo a date change | Undo restores rooms, treatments, diet | Unknown | High |
| 37 | Day patient becomes resident | Switch off-site to on-site; room chosen | Unknown | Med |
| 38 | Resident becomes day patient (moves to a hotel) | Switch to off-site; room freed | Gap → #1189 | Med |
| 39 | One-day stay (start and end same day) | Counts as one night or none, consistently | Handled (nightsEnd rule) | Low |
| 40 | Package length changed after booking | Stay length follows, or a warning | Unknown | Med |

## Room moves

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 41 | Move mid-stay from a date (noise, upgrade) | Earlier nights keep their room | Handled (#1164/#1171, earlier rooms) | High |
| 42 | Move back to the room just left the same day | No leftover record | Handled (moveRooms) | Low |
| 43 | Room out of use forces a move | Affected guests listed; move each | Gap → #1188 | High |
| 44 | Ground floor needed (knees, wheelchair) | Room notes or tags; filter | Gap (no issue) | Med |
| 45 | Swap two guests' rooms | One swap action | Unknown | Low |
| 46 | Double room let as single | Beds versus people per night | Unknown | Med |
| 47 | Attached versus shared bathroom wish | Room type shows it | Handled (accommodation type name) | Med |
| 48 | Room's beds lowered below what is booked | Refused or guests named | Gap → #1186 | Med |
| 49 | Room retired with guests in it | Guests named; move first | Gap → #1187 | Med |
| 50 | Room left mid-stay then retired | Retired, not deleted; history kept | Handled (#1183) | Low |
| 51 | Room taken: suggest another | Free rooms of the same type offered | Handled (ROOM_TAKEN lists free rooms) | High |
| 52 | Rename a room (T-8 becomes Tulsi) | Name changes everywhere, history kept | Unknown | Low |
| 53 | Add a range of rooms at setup | "T1-T9" makes nine | Handled (expandRoomNames) | Med |
| 54 | Day sheet shows the room of each night after a move | Right room per night | Handled (roomOn, #1181) | High |
| 55 | Guest asks for the same room as last year | Earlier room shown when booking | Unknown | Low |

## Sharing, couples, families, companions

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 56 | Couple in one room, separate plans | Two guests, one room, two schedules | Handled (beds per room, nights counted) | High |
| 57 | Couple wants treatments at the same time | Parallel bookings, gender-matched therapists | Unknown | Med |
| 58 | Companion stays, no treatments | Occupant on the room and meal count, not a patient | Gap → #1195 | High |
| 59 | Child with a parent | Companion with age | Gap → #1195 | Low |
| 60 | Two strangers share a double, same gender | Gender rule on shared rooms | Gap (no issue) | Med |
| 61 | One of a couple leaves early | Room stays for the other | Unknown | Med |
| 62 | Roommates move rooms together | One move for both | Gap → #1191 | Med |
| 63 | Gender-matched therapist | Enforced on assignment | Handled (guard) | High |
| 64 | Couple's surnames differ; must be found together | Link guests | Gap (no issue) | Low |
| 65 | Companion later decides to take treatments | Becomes a patient, stay kept | Gap → #1195 | Med |
| 66 | Carer must be in the room during treatment | Note on the appointment | Unknown | Low |
| 67 | Family of four across two rooms | Booked together | Gap → #1196 | Low |

## Groups

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 68 | Group of 20 block-books 12 rooms | Block with a rooming list | Gap → #1196 | Med |
| 69 | Names arrive a week late | Placeholder guests filled later | Gap → #1196 | Med |
| 70 | Group shares one timetable | Copy programme to all | Gap → #1196 | Med |
| 71 | Group shrinks; release rooms | Release from the block | Gap → #1196 | Low |
| 72 | Group exceeds therapists on a day | Capacity warning at booking | Unknown | High |
| 73 | Group import from a spreadsheet | Import check then import | Handled (patients import check) | Med |
| 74 | Group leader is the only contact | Leader on the block | Gap → #1196 | Low |
| 75 | Group activities (yoga, satsang) | Programme events on the day | Handled (programme events) | Med |
| 76 | Group arrives in one bus, late | Shift all arrivals together | Gap → #1196 | Med |
| 77 | Some group members are foreign | Form C list covers each | Handled (Form C rule per guest) | High |
| 78 | Group needs one meal count | Kitchen total includes them | Unknown | High |
| 79 | Group and individual guests want the same room | First booked wins; clear refusal | Handled (ROOM_TAKEN) | Med |

## Outages and maintenance

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 80 | Room out of use for dates (leak) | Not offered for those nights | Handled (outNight in room choice) | High |
| 81 | Room goes out of use with guests in it | Warn and list them | Handled (rule "guest's room is out of use"); move flow → #1188 | High |
| 82 | Power cut; Shirodhara room unusable | Treatment room out, day re-planned | Unknown | Med |
| 83 | No hot water in a house | Note; affected guests listed | Gap (no issue) | Low |
| 84 | Monsoon landslide blocks road | Shift all arrivals of those days | Gap → #1193 | Med |
| 85 | A house closed for winter | Rooms out of use for months | Unknown | Med |
| 86 | Pest control: rooms out for a day | Same as 80 | Handled | Low |
| 87 | Repair finishes early | Shorten the out-of-use dates | Unknown | Low |
| 88 | Room broken but guest stays (minor fault) | Note on the room, no block | Gap (no issue) | Low |
| 89 | Whole centre closed (Diwali day) | Centre closed date; no stays or treatments | Unknown | Med |
| 90 | Internet down; admin's phone offline | Last day sheet printed or cached | Unknown | High |
| 91 | Generator only: some rooms usable | Out of use for chosen rooms | Handled (per-room out of use) | Low |

## Medical

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 92 | Fever or diarrhoea: treatments paused, room kept | Pause from date to date | Gap → #1194 | High |
| 93 | Hospitalised in Haldwani | Pause; room held or released | Gap → #1194 | Med |
| 94 | Menstruation: oil treatments paused 3–5 days | Pause chosen treatments; offer extension | Gap → #1194 | High |
| 95 | Vamana / Virechana day: stays in room | Day with no other treatments | Unknown | Med |
| 96 | Doctor changes the plan mid-stay | Future treatments re-planned | Unknown | High |
| 97 | Contraindication found at consult (pregnancy, BP) | Note; blocked treatments | Unknown | Med |
| 98 | Doctor's review due | Reminder until booked | Handled (review_due rule) | High |
| 99 | Next week not booked after review | Reminder | Handled (next_week rule) | High |
| 100 | Vitals not recorded | Reminder to therapists | Handled (vitals rule) | Med |
| 101 | Emergency contact needed at night | On the guest's card | Handled (emergency contact fields) | High |
| 102 | Medication list | On the card and day sheet | Handled (medication field) | Med |
| 103 | Serious incident or death | Incident note, contacts, stay ended | Unknown | Low |
| 104 | Guest needs a ground-floor room after a fall | Move from that night | Handled (move from date) | Med |
| 105 | Doctor orders bed rest for two days | Pause treatments, room kept | Gap → #1194 | Med |
| 106 | Infectious illness; roommate must move | Move one roommate | Handled (move from date) | Low |
| 107 | Before / after treatment instructions | On the card | Handled (before and after fields) | Med |

## Foreigners and Form C

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 108 | Form C due within 24 hours | Reminder until marked filed | Handled (form_c rule, mark filed) | High |
| 109 | Form C still unfiled after departure | Still asked for | Handled (fortnight after end) | High |
| 110 | Country left blank | Not assumed foreign; admin asked | Handled (empty is not foreign) | Med |
| 111 | Passport and visa numbers | On the card | Handled (id, visa fields, passport photo) | High |
| 112 | Visa ends before the stay | Warning at booking | Unknown | Med |
| 113 | Day patient who is foreign | No Form C | Handled (#719) | Low |
| 114 | Foreigner moves room | Form C details may need updating | Unknown | Low |
| 115 | Foreigner extends stay | New end date on the Form C | Unknown | Med |
| 116 | NRI with Indian passport but foreign address | Country decides; admin can correct | Unknown | Low |
| 117 | Medical visa letter | Letter from the stay | Gap (no issue) | Low |
| 118 | Form C marked filed by mistake | Un-mark | Handled (filed false) | Low |
| 119 | Passport photo for records | Upload, admin only | Handled | Med |

## Festivals and peak

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 120 | Navratri surge: all rooms wanted | Free rooms by date range at a glance | Unknown | High |
| 121 | Phone enquiry: free room 10–24 Dec? | Answer in under a minute | Unknown | High |
| 122 | Waitlist when full | Simple waitlist | Gap (no issue) | Low |
| 123 | Tentative hold not confirmed | Hold with an end date | Gap (no issue) | Med |
| 124 | Minimum stay in peak | Rule or note | Gap (no issue) | Low |
| 125 | Staff on festival leave | Leave reduces capacity | Handled (time off, on_leave) | High |
| 126 | Women's Conference fills Nanda House | Block as a group | Gap → #1196 | Med |
| 127 | Occupancy for the week or month | Count of nights per day | Unknown | Med |
| 128 | Gurudev's birthday: treatments stop for the day | Centre event blocks treatments | Unknown | Med |
| 129 | Peak day needs extra therapists | Capacity shown per day | Unknown | Med |

## Staff

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 130 | Therapist on leave; treatments reassigned | Re-planned in one pass | Handled (day check, replan) | High |
| 131 | Guest's own therapist away | Next choice offered | Handled (their therapist first) | High |
| 132 | Doctor away: no arrival consults | Arrivals that day flagged | Unknown | Med |
| 133 | Housekeeping short | Fewer rooms turned | Gap (no issue) | Low |
| 134 | Therapist quits mid-course | Delete hands over | Handled (#delete hands over) | Med |
| 135 | New therapist joins mid-season | Added; free from start date | Unknown | Med |
| 136 | Therapist sick this morning | Leave from now; day re-planned | Handled (leave + day check) | High |
| 137 | Male guest, only female therapists today | Refused with reason | Handled (guard) | High |
| 138 | Two admins on two phones edit the same stay | Second save refused or merged | Unknown | High |
| 139 | Night watchman needs tonight's arrivals | Printed list | Unknown | Med |
| 140 | Receptionist without full rights | Role limits | Unknown | Low |

## Kitchen and diet

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 141 | Diet by stage (kitchari, fasting) | Diet segments by day | Handled (diet plan segments, course) | High |
| 142 | Jain, no onion-garlic, allergy | Food limits on the kitchen list | Handled (food_limits) | High |
| 143 | Meal count includes companions | Headcount per meal | Gap → #1195 | High |
| 144 | Guest has no diet plan after arriving | Reminder | Handled (no_diet rule) | High |
| 145 | Guest away for lunch (trip) | Skip that meal | Unknown | Low |
| 146 | Late arrival misses dinner | Count from arrival time | Unknown | Med |
| 147 | Diet when stay is paused for illness | Diet follows the pause | Gap → #1194 | Med |
| 148 | Diet course moved when dates move | Moves with the stay | Unknown | Med |
| 149 | Kitchen sheet for a group | Totals | Unknown | Med |
| 150 | Diet change undone | Undo | Handled (course undo) | Low |
| 151 | Day patients eat lunch | Counted if on-site meal | Unknown | Low |

## Records and discharge

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 152 | Every change recorded | Change log in plain words | Handled (change log) | Med |
| 153 | Delete a guest booked by mistake | Delete with stays | Unknown | Med |
| 154 | Merge a duplicate guest | Merge records | Gap (no issue) | Low |
| 155 | Guest asks for their records | Discharge PDF | Handled | Med |
| 156 | Registration number per guest | Field | Handled | Med |
| 157 | Guest's own link to their day | Link with token | Handled (patient link) | Med |
| 158 | Stay history over years | All stays on the card | Unknown | Low |
| 159 | Guest last year: fetch their notes | Earlier stay readable | Unknown | Med |
| 160 | Discharge after stay was shortened | Summary dates follow | Unknown | Med |
| 161 | Printed day sheet shows rooms | Room per guest per night | Handled | High |
| 162 | Who slept in T-3 on 4 Nov (police query) | Room history by date | Unknown | Med |
| 163 | Delete a stay | Room and treatments freed | Unknown | Med |
| 164 | Package linked to stay | Shown on the stay | Handled (package_id) | Med |
| 165 | Stay with no room at all for weeks | Flagged | Unknown | Med |

## Phone and clock edge cases

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 166 | Admin books at 23:55; "today" | Centre's day, not the phone's | Handled (Settings.timezone) | High |
| 167 | Admin travelling abroad with phone | Centre's zone everywhere | Gap → #1197 | Med |
| 168 | Night crosses midnight in the guard | Night belongs to the evening's date | Gap → #1197 | Med |
| 169 | Phone loses signal mid-save | Save either happens or not, clearly | Unknown | High |
| 170 | Two phones, one shows stale room list | Refresh or refusal on save | Unknown | High |
| 171 | Double tap on save creates two stays | One stay | Unknown | High |
| 172 | Small phone: long room names | Wrap, not clipped | Unknown | Low |
| 173 | Date picker in a foreign phone locale | Dates read the same | Unknown | Med |
| 174 | Phone clock wrong | Server time decides | Unknown | Med |
| 175 | Undo after the phone slept | Undo still works or says why not | Unknown | Med |
| 176 | Session expires mid-form | Draft not lost | Unknown | Med |
| 177 | Admin prints from the phone | Day sheet PDF | Handled | High |
| 178 | Daylight saving for a foreign admin | No shift | Gap → #1197 | Low |
| 179 | Demo password still in use | Banner until changed | Handled (#1180) | High |

## Availability and booking checks

| # | Situation | Best-in-class handling | Today in the app | Priority |
|---|---|---|---|---|
| 180 | Same room booked twice | Refused at save | Handled (ROOM_TAKEN) | High |
| 181 | Room full on one middle night only | That night named | Handled (full_on names night and guests) | High |
| 182 | Off-site stay given a full room | Refused or room cleared | Gap → #1189 | Med |
| 183 | Rooms free tonight, at a glance | List | Unknown | High |
| 184 | Free rooms of a type (hut) for dates | Filter by type | Handled (free list by type) | Med |
| 185 | Out-of-use room shown as free | Never | Handled (free needs not out) | High |
| 186 | Room retired but still offered | Never | Unknown | Med |
| 187 | Beds per room set at setup | Field | Handled (beds) | Med |
| 188 | Accommodation type deleted | Its rooms? | Unknown | Low |
| 189 | Room type changed (Trishul to Nanda) | History kept | Unknown | Low |
| 190 | Guest on a waiting list gets a cancelled room | Offer | Gap (no issue) | Low |

## Out of scope (settled in #53)

Advance payments, deposits, credit notes, refunds and invoices; GST billing; online self-booking and OTA channels; marketing, loyalty and offers; more than one centre per install; payroll. Babaji's prepaid-room and cancellation-ladder rules stay outside the app.
