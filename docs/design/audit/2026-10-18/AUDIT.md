# Admin audit, 18 Oct 2026: summary

Phone audit (412x915 and 360x800) of the admin experience on a Babaji-sized
seed (84 in house after loading), by three independent passes. Detail:
[screens.md](screens.md), [stories.md](stories.md), [benchmarks.md](benchmarks.md).
Method and rules: [CHARTER.md](CHARTER.md).

## Verdict

The core is ahead of the field: a therapist off sick at 7 am is 5 taps and
about 6 s with a consequence line, a plan in words, a 5 s Undo and an honest
printed sheet (s2 8 to 14, s10 12 to 15). No horizontal overflow at 360 or 412
and no first-view target under 44 px. Day opens in 3.5 s on slow 4G.

The gaps are around the edges of a peak day: bad signal, a morning of
arrivals, finding a person, and paper. Babaji prints per-person pages today
and the app does not yet replace that.

## Checked by me against the code (not just reported)

- Write limit is 40 per 5 minutes per client (`server/src/index.ts:122`): a
  real arrival morning can hit it, and the toast gives no time.
- Discharge defaults to 09:00 in and 11:00 out (`server/src/discharge.ts:84`).
  It is an editable draft, so lower severity than the agent said.
- A per-therapist PDF exists on the server (`/daily-schedule-pdf?staff_id=`);
  no per-patient PDF exists. `ScheduleTab.tsx:57` offers only the table sheets.

Everything else below is as reported by the auditors, with screenshots.

## Ranked findings (one issue each)

1. (#931) Lost signal or API down shows "0 in house / Nothing booked" and silent
   failed saves (F-S-5, F-offline-1). Blocks a job; breaks DESIGN section 6.
2. (#932) No per-person printed page: patient week, therapist page (F-S-2, F-print-1).
3. (#933) Closing a day with bookings: no warning, no move, "closed for Closed"
   (F-day-1).
4. (#934) Find a patient: no list search, no phone, no surname-first (F-S-1,
   F-search-1). s15 14 to 12.
5. (#935) Arrival morning: card blocks next arrival, room silently preset, 40 taps for
   8 arrivals, rate limit, long names (F-arrival-1, F-S-3, F-S-9).
6. (#936) Stranded sheet on back gesture; leave saved twice (F-back-1, F-leave-1).
7. (#937) Discharge summary defaults and copied note (F-discharge-1).
8. (#938) Wrong labels: inbox under another day, "all done" for an absent therapist,
   "Ruta" footer, Therapies and Classes buried (F-inbox-1, F-day-2, F-S-8,
   F-S-7).

Left as findings only (annoys or cosmetic): booking suggests last therapy not
plan, diet sheet wall of text, 41 identical attention rows, Day control scrolls
away, 51x31 switches.

## Steals from the benchmarks worth doing (all S)

"Tell the guest" WhatsApp tap on a move; Undo from a Log row (s22, 4 taps to
1); "who is free" inside a refusal; therapist sheet "with free gaps";
add-to-home-screen prompt. Traps: room-conflict override, desktop-first
parity, per-seat pricing. Taps in the benchmarks are estimates; no vendor
publishes counts.

## Needs the maintainer

1. Public holidays: start closed, or open and you close the ones you want?
   (answerable in Settings today)
2. Does Babaji print one page per therapist and per patient daily, or one sheet
   for the notice board? (not in app)
3. Discharge: real leaving time, or date only? (not in app)
4. Therapist off sick: also message the patients who move? (not in app)
5. PIN or fingerprint before patients show when the phone is handed over? (not
   in app)
6. Closed day for a retreat: auto-move its treatments with one Undo? (not in
   app)
7. Print the Day sheet and look: is 8 pt readable for the oldest therapist? (not
   in app)

## Not covered

Patient link page (rate-limited out), Day at 06:30, a stressed Log, Setup past
step 1, the native Android date picker (taps estimated), real Android
hardware, and 70 residents on site (seed has 8 guest rooms). Fifty stories were
not all re-walked: about 30 plus peak jobs; the rest are marked "carried".
