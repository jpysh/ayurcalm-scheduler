# Benchmarks, 18 Oct 2026

Public sources only (help centres, product pages, Capterra/G2/GetApp summaries). Web search gave summaries, not full pages, so most claims are "per search summary of <URL>". `[V]` = read from the vendor page itself, `[R]` = review-site summary (many are 2016-19, may be stale), `[U]` = unverified. Taps are not published by any vendor; none are claimed. Mobile evidence is thin everywhere: vendors document desktop. That is itself a finding.

## Products used (and dropped)

| Product | Kind | Used | Best idea | Biggest annoyance |
|---|---|---|---|---|
| Fresha | salon/spa | yes | Move dialog shows conflicts and lets you choose whether to notify the client [V] https://www.fresha.com/help-center/knowledge-base/calendar/263-reschedule-appointments | No bulk move when staff are off; you move one by one [V] same URL. Calendar not syncing outside bookings [R] https://www.capterra.com/p/142138/Shedul-com/reviews/?page=8 |
| Mindbody / Booker | spa/wellness | yes | Room booking stops double-booking [R] https://capterra.com/p/90708/Booker/reviews/?page=5 | Rooms/equipment "do not work", support says override; "room already in use" when moving [R] same; app lacks desktop features [R] |
| Zenoti | spa chain | yes (thin) | One booking flow holds couples, multi-service packages, room and therapist [V] https://www.zenoti.com/spa-management-software/spa-appointment-app | Glitches, slow response [R] https://www.getapp.com/retail-consumer-services-software/a/zenoti/reviews/. Staff-side conflict handling [U]. Enterprise-priced [U] |
| Jane App | physio/clinic | yes | Print Day Sheet per staff, three layouts (Schedule, List, List with unscheduled times) [V] https://jane.app/guide/print-daysheet | Phone guide describes viewing and adding, not moving; one staff schedule at a time [V] https://jane.app/guide/using-jane-on-a-smartphone. Print is a desktop job |
| Cliniko | physio | yes | Uncancel restores the original details; log shows who cancelled and why [V] https://help.cliniko.com/en/articles/6948892-uncancel-patient-appointments | Phone is just the browser; no bulk cancel found [V] https://help.cliniko.com/en/articles/1141545-access-cliniko-on-a-mobile-device |
| Acuity | generic | yes | Cheap, fast setup [R] | Mobile app "limited functionality", lacks editing [R] https://capterra.com/p/191978/Acuity-Scheduling/reviews/ |
| Square Appointments | generic | yes | Free solo tier; Premium ($149/location) adds resources [R] https://www.merchantmaverick.com/reviews/square-appointments-review | Feature gating, fees, calendar sync [R] |
| AyurGrid | Ayurveda | yes | Multi-sitting schedules (20-30 sessions), room clash prevention, stage tracking purva/pradhana/paschat [V-marketing] https://ayurgrid.com/solutions/panchakarma-centers | No sequence rules, printing, mobile or self-hosting stated; no pricing shown [V] |
| M-Techsoft Ayurveda | Ayurveda | marginal | Therapist and room allocation, GST invoices [V-marketing] https://m-techsoft.com/Project10.aspx | Brochure only |
| Booksy, Vagaro, Boulevard | salon | dropped | no usable mobile-admin evidence found; only star ratings (https://www.getapp.sg/compare/106681/2009767/booksy/vs/boulevard) | n/a |
| AyurSutra | Ayurveda | dropped | student hackathon concept, not a product | n/a |

Not found at all: any residential retreat or Indian hospital bed-and-roster tool with public mobile evidence.

## What the market does, in one paragraph

Salon and clinic tools assume a front desk on a desktop, a client who self-books, and one appointment at a time. None of the sources show: a day planned in one pass when a therapist is off, a fixed order between treatments, a printed per-patient schedule, or a kitchen/meal tie-in. The strongest mobile ideas are small: conflict shown before the save, choose-to-notify, uncancel, and a per-person print layout.

## Per-job verdicts

| Job | Market | AyurCalm today | Verdict |
|---|---|---|---|
| Day view on phone | Fresha drag/drop calendar; Jane Day tab one staff at a time [V] | `components/DayList.tsx`: hour groups, regroup by therapist/room/patient, no hidden rows | Ahead |
| Reschedule when staff is off | Fresha: one by one, no bulk [V]. Jane/Cliniko: not documented [V] | `server/src/replan.ts` + `dayCheck.ts` plan the whole day in one pass, with Undo | Ahead (but s2 scored 8/16 in the 7 Oct walk; fix before bragging) |
| Room/resource conflicts | Booker: unreliable, override [R]. Fresha: warn + override [V] | `appointmentGuard.ts` refuses on the server; `/day-check` agrees (`npm run test:day-check`) | Ahead. Do not copy "override and ignore" |
| Multi-step packages, ordering | AyurGrid: stage tracking, no stated order rule [V]. Zenoti: packages in one flow [V] | `before_purification`, `once_per_course` in `appointmentGuard.ts` line ~266, Book anyway after warning | Ahead |
| Print or share day / per person | Jane: per-staff Day Sheet, 3 layouts, desktop [V]. Fresha/Booker: none found [U] | PDF day sheet, per-patient and per-therapist; `ShareLink.tsx` private link + WhatsApp | Ahead. Steal Jane's "List with unscheduled times" idea only if the sheet lacks free gaps (check) |
| Patient profile | Cliniko/Jane charts; Zenoti profiles [R] | `PatientsTab.tsx`, card sheets, discharge | Skip (parity) |
| Notify staff | Cliniko opt-in SMS/email for cancellations, only when someone else cancels [V] https://help.cliniko.com/en/articles/1024090-appointment-cancellation-notifications-for-practitioners | Alerts are email only by decision (`decisions/2026-10-09-alerts-email-only.md`); team link | Steal the rule "tell a therapist only about changes made by someone else to their own day" if not already so (verify in `changeLog.ts`) |
| Undo / audit | Cliniko Uncancel + log with reason [V]. Fresha: none found [U] | Undo toast (`ConfirmSheet.tsx` comment), `LogScreen.tsx`; walk found no Undo on a Log row | Ahead; steal Cliniko's undo from the log row |
| Setup time | Square/Acuity minutes, Zenoti long onboarding [U] | `docker compose up -d`, wizard, `SetupSheets.tsx` | Skip. Self-host is the moat; the cost is the maintainer's patience, not the admin's |
| Pricing/self-host | Square $49-149/location [R]; Fresha takes marketplace fees [R]; none self-hosted | MIT, self-host | Ahead |
| Notify the guest on a move | Fresha: choose-to-notify in the move dialog [V] | Guests do not self-book; link lapses (`decisions/2026-10-18-guest-link-lapses.md`) [verify if a move offers a guest message] | Steal (S) |

## Top 10 steals, ranked by taps saved per cost

Taps are estimates against today's app, unverified in the running stack; auditors should confirm.

1. **Choose-to-notify at the move** (Fresha). A move that changes a guest's time offers "Tell the guest on WhatsApp" as one prefilled tap in the confirmation, instead of Open card, row, Send (3 taps per guest, s32 walk). Saves ~2 taps per moved guest, up to 4 guests on a therapist-off day. Cost S. Fits: ShareLink already builds the message.
2. **Undo from the Log row** (Cliniko uncancel). Walk 4 found no Undo on a Log row; the `2026-10-18-undo-asks-if-changed-since.md` decision already says how. Saves the "find it again by hand" path (about 4 taps to 1). Cost S-M.
3. **Conflict preview before save, with the fix filled in** (Fresha). Already mostly there; steal only the wording: show "who is free" in the refusal itself. Saves 1-2 taps. Cost S.
4. **Print layout "with free gaps"** (Jane). One extra toggle on the therapist sheet showing free slots so the admin can write in a late request on paper. Saves a re-plan trip, ~3 taps. Cost S if the PDF code supports it, else M.
5. **Cancel/leave notifies only the person affected** (Cliniko). Quiet by default; the admin's own edits never email the admin. Saves noise, 0 taps, protects calm tone. Cost S.
6. **Stay-wide "move all of X's day to Y"** (nobody does well; Fresha lacks it). Already `replan.ts`; surface one button "Hand Meera's day to the free therapists" on the leave screen so s10 does not end "stuck". Saves ~8 taps to 2 on a leave day. Cost M.
7. **Home-screen shortcut prompt** (Cliniko, Jane both tell the user to add one). Admin opens from the icon, not the browser. Saves 2-3 taps every morning. Cost S (a line in Settings and the wizard).
8. **Repeat-series "this one or all future"** (Fresha) for a daily treatment course: change one day or the rest of the course. Saves ~5 taps on a 7-day course shift. Cost M. Check `once_per_course` model first.
9. **Cancellation reason chip** (Cliniko). One tap among 3-4 reasons gives the log meaning (patient unwell, therapist off). Adds 1 tap, so only if the log is read; skip unless s22 needs it. Cost S.
10. **Two schedules side by side for admin** (Jane swipe to see two practitioners). Day regroup by therapist already covers it. Skip, listed to close the loop.

## Top 5 do-not-copy traps

1. **Override-and-ignore on rooms** (Booker support tells users to override [R]). A warning anyone can bypass becomes a double-booked room at 7 am. Keep the server refusal.
2. **Desktop-first parity** (Acuity and Booker mobile gaps [R]). The phone is the product; never ship an action that only works on a wide screen.
3. **Per-location or per-seat pricing and feature gates** (Square, Fresha fees [R]). One centre, MIT; no tiers.
4. **Client self-booking and marketplace** (Fresha, Booksy). Settled out of scope (#53).
5. **One appointment at a time**, with a batch left to the admin (Fresha). A therapist-off day must be planned once, which AyurCalm already does.

## Cheap "invent" ideas (nobody does these; suit residential Ayurveda)

- **Sequence rules as a one-line preview**: "Snehapana days 1-5, then virechana day 6" shown when booking the course. Source claim: no vendor states sequence rules (AyurGrid page silent [V]). The guard already knows the order; surfacing it costs S.
- **Meal follows treatment**: after a purification day, the kitchen sheet defaults to the lighter meal plan. `dietResolution.ts` and the kitchen sheet exist; the tie-in is a rule on the course day. M. [Verify not already there.]
- **Daily round list**: the doctor's morning list is the day sheet filtered to "today's changes plus anyone flagged" (s8/s45 partial). M.

## Not verified

Mobile tap counts for every product; Zenoti and Mindbody current staff apps; Vagaro/Boulevard/Booksy detail; Indian clinic apps beyond AyurGrid's marketing; whether AyurGrid has a phone app.
