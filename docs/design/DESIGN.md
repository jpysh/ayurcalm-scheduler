# DESIGN.md — the AyurCalm phone app

The admin app on a phone, 375 wide first. One operator, one hand, often standing. Every rule below is
either a number to use or a question to answer; if a screen needs a rule this file lacks, add it here
first (#285). Screens come from the approved top 50 stories in [STORIES.md](STORIES.md) (7 Oct), walked back from the
outcome the admin wants, never from today's screens. Layout borrowed from awesome-design-md's format;
values are ours. Sources read (rounds 1 and 2): Apple HIG (layout, iOS 26 tab bar and bottom search,
sheets, 17pt body / 15pt secondary), Material 3 Expressive (shorter bar, FAB menu instead of stacked
FABs), Airbnb (one shadow, 4px base, soft radii, a host "Today" home), Baymard (mark required *and*
optional, inline validation with a positive check, labels above, progressive disclosure), NN/G on iOS 26
Liquid Glass (controls that appear and vanish, crowded targets and text over busy backgrounds all hurt),
and Atlassian's DESIGN.md test (agents rebuild components instead of reusing: so §7 names the kit).
Round 3 (Task A, 6 Oct): Airbnb's four principles (unified, universal, iconic, conversational), Nielsen's
10 heuristics and response-time limits, calm technology, Hoober on thumb reach, and the touch
keystroke-level model for time to done (STORIES.md, wow bar).

## 1. Principles

1. **The facts a decision needs are on the first view.** Everything else is one tap away, never zero taps of clutter.
2. **One main action per screen**, green, at the thumb. Everything else is quieter.
3. **Say what will happen** before a tap, and what did happen after it. No spinners that redraw the sheet.
4. **Flag only what needs doing.** A row with no flag is fine; a row with a flag is an instruction.
5. **Time to done never goes up.** Measured in seconds by the formula in STORIES.md (taps × 0.5 + characters × 0.3 + decisions × 1.35 + waiting); taps are reported beside it. A job that gets slower must buy something the admin asked for.
6. **The printed day sheet is the product.** A screen change improves it or leaves it alone. The sheet is right when every treatment, therapist, room and meal is on paper, nothing is below 10 pt, each therapist's rota fits one A4, and the UAT reads it with `pdftotext`.
7. **Start from the story.** A screen exists because a story in STORIES.md needs it. A screen no story needs is deleted.
8. **Stable anchors.** Controls the admin has learned never move; only the extras between them come and go (NN/G: controls that appear and vanish break learning).

## 2. Colour roles

Green stays. Colour means one thing each; never decorative.

| Role | Token | Value | Use |
|---|---|---|---|
| Text | `--foreground` | #1F2A30 | body, names |
| Muted | `--muted-foreground` | #5B6A70 | secondary lines (4.5:1 on card) |
| Faint | `--faint` | #8A979C | disabled controls and an empty stripe only (3:1: never for a fact or a placeholder) |
| Surface | `--background` | #F4F7F2 | page |
| Card | `--card` | #FFFFFF | lists, sheets |
| Sage | `--secondary` | #E3ECE0 | pressed, selected, quiet fills |
| Primary | `--primary` | #3D6B4F | the one main action, selected state, links |
| Border | `--input` | #7A8E7F at 45% | field outlines (visible as a box) |
| Line | `--line` | #E6ECE3 | hairlines between rows |
| Alert | `--alert` | #A94A26 on #FBEAE3 | something must be fixed or chosen now |
| Notice | `--notice` | #6E4A0E on #FBF0D9 | done for you, or worth a look |
| Now | `--now` | #C2410C | the current time only |
| Therapist colours | `--t-1`…`--t-8` | index.css | identity stripe on rows; never red, orange or green-primary |
| On dark | `--on-dark` | #B9E2C6 | Undo and the Print note on the dark toast and bar |

Rules: text on any fill ≥ 4.5:1; large text ≥ 3:1; state is never colour alone (icon or word too).
Dark mode is not in scope.

## 3. Type

System font stack (San Francisco on iPhone, Roboto on Android). No web font: it costs a load and looks foreign.
Nothing a decision needs is below 14px; 16px in any input (iOS zooms below it). Apple sets body at 17pt; we take 16 for density and add 1 to row titles. Numbers are tabular.

| Style | Size / line / weight | Use |
|---|---|---|
| Title | 24 / 30 / 700 | sheet and card title (a person, a day) |
| Heading | 20 / 26 / 650 | page head |
| Row title | 17 / 22 / 600 | a name in a list |
| Body | 16 / 22 / 400 | facts, fields |
| Secondary | 14 / 20 / 400 | second lines, notes, labels (Apple's 15 secondary, less one point to fit two facts per line) |
| Caption | 12 / 16 / 600, caps +0.05em | group headers, tags; never for a needed fact |

Every screen works at 200% text size (Apple's Dynamic Type): rows grow, facts are never cut.

Two weights per screen at most beyond 400: 600 for what you tap or scan, 700 for the title.

In code the scale is `tailwind.config.ts`: `text-xs` caption · `text-sm` secondary · `text-base` body · `text-row` row title · `text-lg` heading · `text-xl` title. No `text-[13px]`; 13 and 15 are not on the scale. Any fact the admin needs is `text-sm` or larger; `text-xs` is only for caps captions and tags.

## 4. Space, radius, elevation

- **Spacing, 4px base:** 4 · 8 · 12 · 16 · 24 · 32. Screen gutter 12 (lists) or 16 (sheets). Gap inside a row 12. Between groups 24.
- **Touch target ≥ 44 × 44.** A 36px control needs 8px of dead space around it. Rows ≥ 56 (two lines) or 48 (one).
- **Radius:** 12 for cards and lists, 12 for fields, 20 for sheet tops, pill (999) for buttons, chips, the bar. Nothing square.
- **Elevation, one shadow:** `0 4px 18px rgb(31 42 48 / .14)`, used by the bottom bar, the floating pill, toasts and sheets. Everything else is flat, separated by a hairline or a fill. No second shadow.

## 5. Motion

150–200ms, ease-out, and only to explain where something came from: a sheet rises from the bottom; a row
that changes settles in place. Nothing bounces. `prefers-reduced-motion`: no transforms, opacity only.
Never animate the content of a list the admin is reading.

## 6. States

Every list, sheet and button has all of these designed, not left to default.

| State | Rule |
|---|---|
| Empty | One line saying why and what to do ("No one arrives today"), with the one action beside it if there is one. Never a blank screen. |
| Loading | Skeleton rows the height of the real ones, or nothing for under 300ms. Never a spinner over content that was there a moment ago; never text like "Finding…" then a redraw. |
| Error | Where it happened, in words: what failed and what to do. A retry button. Fields: under the field, alert colour, on blur. |
| Disabled | Faint text, no shadow, and a line saying what is missing when it is not obvious. |
| Saving | The button says "Saving…" and is inert; the sheet stays. Done: close and toast with Undo where it can. |
| Selected | Primary border + sage fill + a check for icon-less options. |
| Pressed | Sage fill. |
| Offline | A failed save keeps what was entered, says so, and retries; the last printed sheet stays openable. Hill-station signal drops. |
| Timing | Acknowledge a tap within 100 ms; show progress past 1 s; past 10 s keep the admin's place and let them leave (Nielsen). |
| Focus | 2px primary outline, 2px offset (keyboards and switches); fields also a soft 3px halo. |

## 7. Components (all live in `src/components/kit.tsx`)

- **Bottom bar** (5 Oct, amended 6 Oct #313): the hamburger stays at the same pixel bottom right on every screen (56 high, 10 from the edges, the one shadow, a count badge when something needs the admin (red) or is for their information (grey)). On a screen that adds something, the screen's one main action is a filled round **+** beside it, to its left (Day: Book a treatment; Patients: New patient; Team: Add a therapist or doctor; Rooms: Add a room; Leave: Add leave; Diet plans: New diet plan; Therapies and Events: Add). Settings, Help and Log have none. Every screen except the day has a slim header: **‹ Day** (or ‹ the screen the admin came from) at the left, the title, its count; the phone's back keeps working. ‹ Day is the hardest reach (top left, Hoober): the edge swipe and the Menu are the one-handed way back, and every job's steps sit in the lower half. The Menu is for going places and secondary actions, in this order: what needs you (only when something does, red), Search, Change day and Print (day only), the info-only inbox row, and "Go to" the screens as two-across tiles ("Back to the day" first tile away from it). Team and Rooms are separate tiles and screens, each + adding only its own kind; Therapies and Events open from Team's top rows (#328). It never repeats the main action. Search, when chosen, takes the bar's place with its field above the keyboard. Hidden while a sheet, form or the keyboard is open.
  - Anchors: the button is at the same pixel on every screen. A task that used + , Search or the pill costs one tap more than before, accepted.
  - **Week strip** (the day screen's top, replacing the ‹ › header): one week, Sunday first as Apple Calendar draws it, swipe for the next or last week, tap a day; today has a ring, the chosen day is filled, "Today" appears when away from it. Far dates: Menu, Change day.
- **+ (adaptive).** 50px green circle, always a plus. It adds what the screen is about: day → treatment, Patients → patient, Leave → leave, Team → therapist / room / therapy (a small choice sheet). Editing is a tap on the thing itself. Its accessible name says what it adds ("New patient").
- **The day's date strip** (6 Oct): solid, sticky, with the hour headers sticking flush beneath it (its height is published as `--strip-h`, never a fixed number). Past about 140px of scroll it folds to one line, "Mon 5 Oct · week ›" (tap: back to the top), and unfolds again near the top; the list is moved by what the strip lost so nothing jumps.
- **Booking from + (#330, decided 6 Oct, built 6 Oct).** No therapy is preselected: it is a visible list with facts (had 4 Oct, already today) and Book says 'Choose a therapy' until one is picked. At most 4 treatments per patient per day (a Settings number) and the same therapy not twice in a day are soft rules decided on the server, shown as a warning with **Book anyway**. A refusal always carries a way forward (next free day, tomorrow, add a therapist of the right gender, change the stay), never only text above a greyed button. The patient picker offers 'Add "name" as a new patient' when nobody matches. After Book the sheet offers **Add another** for the same patient. 'Sessions' reads 'Days in a row' with chips One / 3 / 5 / 7 / 14 / Other and a result line. Built as: past 12 therapies the list is the last one had, what is already booked that day, and 'Other therapies' (a search); a dead end's button names the day ('Book tomorrow at 09:00' only on today, else the date; 'Go to Sun 18 Oct' for a stay); the booked toast sits at the top so it never covers Add another; the actions come from the server (`actions` on options and on every refusal). Book one treatment is now 4 taps because the therapy is chosen, never defaulted.
- **Search.** One, opened from the bar; the field sits at the bottom above the keyboard (Apple's placement for iPhone), results above it. On a list it filters that list first, then offers "Search everything". No search box at the top of a screen.
- **Row.** Stripe or nothing, title, one or two second-line facts, one trailing fact (time, room, count). A flag is a line in alert colour under the facts, only when something needs doing.
- **List group.** White, radius 12, hairlines, a caption header with a count.
- **Page head.** Heading and one small summary ("71 in house"). Filters are chips under it (≤ 4 visible).
- **Sheet.** Grab handle, heading, one line saying what it is for, body, and a **sticky foot** with the one main button. Scrim 40%. Close by swipe, scrim tap, or Escape. Never over 88% of the screen.
- **Buttons.** Labels say the action and its object ("Book Ananya", "Give to Bhavna Sharma"), never "OK" or "Submit". Primary (green fill), secondary (border), quiet (text), destructive (alert text, never a fill). 44 high, pill, one primary per view.
- **Fields.** From the form kit: 44 high, radius 12, label above (never inside) at 14/600, 16px text, halo on focus. Right keyboard (`inputMode`, `autocomplete`). Mark both kinds: "(optional)" after the label of optional fields, nothing on required ones, and say so once under the sheet title when a form has both (Baymard: 94% of sites do not). Validate on blur, under the field, with a green check when right. Ask four things or fewer first; the rest under "More details".
- **Consequence line.** Under any field that changes other things (a leave date, a stay date), one live line in Small says what will change: "3 treatments that day will need a new therapist".
- **Pill and inbox.** The floating pill above the bar says "4 need you" and is there only while something needs action. It is the one inbox for the whole app: its sheet lists items in sections (Day · Patients · Team), each with its one action; information items are grey and not counted. What counts is set in Settings → What needs you (rules with on/off and a number; a few locked on). Patients and Team have a "Needs attention" chip and a gear that opens their rules. A day with nothing booked is normal and never a flag.
- **Checklist bar.** A single row, "Discharge summary · 5 of 8 ready", with a slim progress line; tapping lists what is missing, each item opening its field. It informs and never blocks.
- **Timeline list.** Dated changes in order ("From 30 Sept · Light, no curd", "From 5 Oct · …"); each starts where the last ended; the last runs to the end of the stay.
- **Picker.** A list of options with a name, one line of description and a trailing fact (price, count); selected = primary border + check; an Edit link opens the catalogue in Settings.
- **Two-button foot.** Main action, and beneath it one quiet alternative ("Save, plan later"). Never two fills.
- **Choice +.** When + can add several kinds of thing, it opens a small sheet of choices (a FAB menu), never a second button. No screen needs one since Team and Rooms split (#328).
- **Change line.** A label on the left, its value on the right, a `›` when it can change ("Therapist · Priya ›"). One tap opens the phone's own list (`LineSelect`, `LineDate`) laid invisibly over the whole line; free choices come first and busy ones stay listed, greyed and disabled, with why ("Asha · has a treatment"), so a clash is never picked by accident. The same line, with no list, is a card's row with an arrow (Diet, Therapies, Stay, Details); a faint value says nothing is decided yet.
- **More details.** A folded row, "More details · phone, passport… (optional) ›", for what a form does not need to start. Fields inside say "(optional)".
- **Search field in a sheet.** When a sheet starts by finding someone, its foot holds the field (`SearchField`, above the keyboard) and the list above it shows at most five suggestions; typing replaces them with matches.
- **Quick dates.** Today and Tomorrow as two chips above the phone's calendar row (`QuickDates`), for any change that usually starts now: a diet, a stay.
- **Preselected best option.** A picker opens with the sensible choice already ticked and in view (the package nearest the stay's length), so the common case is one tap on the foot. Money is `rupees()`: "Rs 70,750", whole rupees, always marked as reference.
- **Sheet foot and link row.** A sheet's foot is `SheetFoot`: the main button names the outcome ("Add the room"), a quiet destructive line under it for what exists. A list that leads somewhere else starts with `LinkRow` ("Standard therapies · Add from the library ›"). Delete asks in a sheet that says what goes with it, never a dialog.
- **Settings parts.** The front door is groups of `Row`s that say their own state ("Last backup 2 hours ago"), with one sheet each; a long sheet is headed parts (`SectionHead`) and one Save. A rule is a `SwitchRow`: name, one line of state, the switch, and its "when" inline in the sentence as a value that opens the phone's own list; a changed value is amber (`--notice`). A record is `EntryRow`s under a day (the Log). An inbox item is an `ItemRow`: what it is, its facts, its actions under it. A screen's gear (`PageHead gear`) opens the rules for what that screen raises.
- **Buttons in the kit.** `Btn` (primary, secondary, quiet, destructive; `inline` for its own width) and `LinkBtn` for one that leaves the app (WhatsApp, a PDF). A state word on a card is a `Tag`; what is wrong, with its fix under it, is a `Callout` (alert tint only when it must be fixed now). A sheet's second page passes `onBack` to `BottomSheet`: Back sits above the title, never beside it.
- **Screens that are not the app** (sign-in, setup, a private link) are a `FullPage`: page colour, one centred column, 16 gutter, the same fields, rows and buttons as a sheet. Never a shadcn Card.
- **Starter kit.** The last setup step offers the kit first and ticked ("Residential Ayurveda starter kit", what it holds, counted from the centre), then "Keep the example data", then "Start completely empty" (asks, as it deletes).
- **Kit first.** Before writing markup for any of the above, use or extend `src/components/kit.tsx`. A one-off size, colour, radius or shadow in a screen file is a defect: a button is `Btn`, never a styled `<button>`; a left-aligned text button (`quiet`, `destructive`) carries `-ml-2` so its words sit on the gutter while its 44px target keeps 8px either side.
- **Chips and segments.** Chips: filters and multi-choice. Segments: one of 2–4 in view.
- **Toast.** Above the bar, dark, one line, one action (Undo). 5 seconds.
- **Pill.** Floats above the bar only while something is waiting; says how many and what kind.

## 8. Patterns

- **Booking is one sheet.** Who (search at the bottom, at most five suggestions: no treatment yet today, then recent) → everything else fills in place and stays editable: therapy (last one, with its date), date, sessions (one; or 2–21, one a day at the same time and therapist: all of them or none), time, therapist, room. The button names the outcome. No loading flash, no long lists.
- **Nothing is forced.** A patient can be added with four fields; diet, package, accommodation, consultation and details are rows with arrows, filled when the admin decides. Discharge printing is never blocked by missing data.
- **Cancelled, never removed.** Anything the admin ends (a treatment after a shortened stay, a leave-affected slot) is marked cancelled with a reason and kept in the patient's record and audit trail.
- **Decisions sit where they belong**: the suggestion is in the free slot, the fix is on the problem row.
- **Confirm by undo, not by asking**, except for removal of history or anything that cannot be undone.
- **A button that cannot work is disabled, and the sheet says why** in one line under the field that is missing. Every button in the foot follows the same rule. No error toast for something the form could have said first (#337).
- **Forms group by kind, not by field.** Ask everything for one kind of thing, then the next: all treatment-day meals, then all rest-day meals (#338).
- **Space under the last row clears the + and Menu buttons and no more.** The screen supplies it once; a list never adds its own (#335).
- **Anything that changes the bar's height moves only at the very top of the page**, or the page can bounce between two states (#332). Test it by tapping the date from the bottom.
- **A dead end opens the fix already filled in.** "Change their stay" opens the stay sheet over the booking with Leaving already on the asked-for day; save returns to the booking on that day (#343).
- **Demo and test data model a real week** (#348): mostly 2 treatments a day, rarely 3; most patients planned a week ahead at the doctor's review; arrivals, departures, day visitors and outpatients every day. Lite for the demo, full for tests. The therapist on leave today is the senior one, trained in everything and in 09:00–20:00, so their stranded treatments run from the morning past 18:00 (#369; decided by Claude, to confirm).
- **Team is read by day, not by grid** (#351): a week strip, then Doctors and Therapists, each row with their hours that day and how much is booked; away is struck through with the reason. Hours are a weekly pattern on the person's card; a one-off change is leave for part of the day. Built 6 Oct (part 1): rows read "07:00–15:00 · 2h 30m of 11h booked", a day without hours "Day off", any day of the strip; the old This week sheet is gone. Part 2 (6 Oct): a **Too few therapists in** line under the strip names each run of hours, inside the centre's hours, with fewer than two therapists in ("15:00–20:00 · only 1 in"; decided by Claude, to confirm: two is the floor because one cannot cover a two-therapist therapy or a swap); a row over 90% booked reads "nearly full", under 25% "lightly booked", as words not flags (decided by Claude, to confirm: neither needs doing now); the card's **Hours** line, under Gender, opens a page of seven weekday lines, each Full day / Early 07:00–15:00 / Afternoon 13:00–20:00 / Day off. Hours set by hand are now a rule on the server: outside them, or on a day off, a booking is refused as leave is, and the day check flags what is already there; a person never given hours works the centre's hours. Before the save, the Hours page says which booked treatments the new pattern leaves outside (up to three named, "and N more"), asked of the server (#380). Part 3 (6 Oct): the seed staffs by shifts (early 07:00–15:00 with the morning classes, afternoon 13:00–20:00 with the evening ones, a 09:00–18:00 day for the rest and for the one on leave today, one Wednesday off, doctors 08:00–14:00), and the rota prints each person's hours over their booked time; a day off prints with those away.
- **The card leads with the week** (#350, 6 Oct): Next days and the doctor's last note come before the change lines; empty days before the review are flagged, after it they wait for the review as one row. Planning next week is one sheet that repeats this week, each line swappable, booked all or nothing (#353, #354).
- **Plan next week** (#354, 6 Oct): planned from the coming review (today's, if the doctor saw them today); it repeats the seven days up to it on the same weekdays, at the same time and therapist where free, else the nearest free time. The leaving day is left empty. A line with a day that has no free time starts unticked and says so; Book all is one transaction and one Undo.
- **A treatment under way is still the admin's** (#367, 6 Oct): while it runs, a therapist or room that is not there is flagged, worded for now ("Aarav is waiting: Kumar Sharma is not in"), with the same fixes; once it ends it is history and never raised.
- **Once a stay** (#365, 6 Oct): a therapy can be marked "Once a stay" (on in the library for Vamana and Virechana). Plan next week never repeats it, and booking a second one in the same stay is asked about with Book anyway, never refused.
- **Before a purification** (#375, 6 Oct): a therapy marked "before a purification" (Snehapana, from the library) is never proposed by Plan next week on or after the day of the stay's Vamana or Virechana, given or booked. Before one is booked it repeats as usual. No switch on screen yet: the library sets it.
- **Too few hands is named** (#368, 6 Oct): when a treatment cannot be placed because too few trained therapists are in, the inbox says so ("Njavarakizhi needs two therapists, and only Raj Das is in that day") and offers **Add a therapist for …** and, for a therapy needing more than one, **Let one therapist give …** (a change to the therapy, kept in Therapies). Never "booked for 30 days" when the diary is empty.
- **Diet sheet order** (#355, 6 Oct): the running plan's timeline (its step opens the plan to edit), then **Change to**, the plans with one-line descriptions, then the start date (Today preselected), then the patient's own **Medication and notes**, then Meals today. A plan is its 8 meals; medication and how to eat around treatment belong to the patient (decided 6 Oct) and print in their own row, the notes only on a treatment day.
- **What a link records is read on the treatment** (#219, 6 Oct): the card shows "Recorded" (vitals, checks ticked, room ready) and "Patient said" (Good or Not good, and their words), read only, never flagged or printed; a 👎 is still a note in the inbox. Not summed per therapist or therapy (decided by Claude, to confirm: wait until a centre asks).
- **One row per patient in the inbox** (6 Oct, #370): two things for one patient read as one row, facts joined ("Arrival steps still open · No diet plan"), opening their card; the pill counts patients, not items. Every date on screen comes from `dayText` ("Tue 6 Oct", no comma).
- **Fix all** (6 Oct, #358): when two or more of the day's problems each have one answer, the inbox's Day section starts with a green "Fix all N as shown" over the list, which is the preview. One call, one batch, one Undo. A problem that asks the admin to choose is never in it.
- **Show the day by** (5 Oct): a "By time ▾" chip on the day's count line, beside "170 treatments · 22 rooms", opens a sheet with Time, Therapist, Room, Patient. It is a lens on the list, so it sits on the list, not in the Menu. Search is named "Search" (it reaches patients, therapists, treatments and other days), never "Search treatments".
- **Leave is the team's** (5 Oct): the list holds staff, room, therapy and patient leave, which changes daily. The centre's closed days (public holidays, a closed day) are one row at the top, "Centre closed days · Next: Dussehra, 20 Oct", opening their own sheet; they are set about once a year. Each row's facts start with its kind (Therapist, Doctor, Room, Therapy, Patient), since a name alone does not say whether it is a room (#360).
- **Open every day by default** (6 Oct, #393; decided by Claude, to confirm): a residential centre treats patients every day, so "Open on" starts with all seven days, as the setup wizard already does. A weekday the centre unticks is refused for booking like a centre closed day, with the next open day offered.
- **A private link is sent, not pasted** (7 Oct, #413; decided by Claude, to confirm): Share their link opens a sheet with **Send on WhatsApp to <name>** (their saved phone, one line of text and the link) and **Copy link**. A 10-digit phone is taken as Indian (+91); with no phone saved, WhatsApp asks who to send it to.
- **What already happened says so, quietly** (7 Oct, #394): a finished treatment whose therapist or room was not there keeps a grey line on its row ("Ravi was not in"), as the printed sheet does. Information only: never on the pill, never in the inbox.
- **A past guest's card offers New stay** (7 Oct, #437; decided by Claude, to confirm): with no stay now or coming, the card says "Stayed until Tue 29 Sept" and shows no Next days, so nothing is flagged for someone who left. A **New stay** row opens the stay sheet from today on their last package (its length and the package itself). The diet is chosen again, since the doctor decides it at the consultation.
- **Form C for a foreign guest** (7 Oct, #415; decided by Claude, to confirm): Country is the nationality; a guest whose country is set and is not India is raised in What needs you as "Form C due by <day after arrival>" until the stay's Form C is marked filed. Their card has a Form C row opening a sheet of the FRRO fields, each copied with one tap (dates as dd/mm/yyyy). Visa number and valid-until are asked in Details only for a foreign guest.
- **The demo's seeded day stays clinically consistent** (7 Oct, #403; decided by Claude, to confirm): the seed never marks a purification (Virechana, Vamana, Snehapana) as missed or cancelled, gives the post-Virechana gruel only to a patient in samsarjana, and otherwise shows its one-meal change as "upset stomach".
- **Type nothing the app knows.** Suggest from history, prefill from the stay, scan an ID. Characters typed per job are measured, and a known fact retyped is a defect.
- **Voice and tone.** Calm and specific, never blames, no exclamation marks; a normal day is never described as a problem.
- **Language:** "patient" (never "resident"), British spelling, sentence case, times in 24-hour, dates "Wed 30 Sept". No jargon, no raw ids, no snake_case.

## 9. Per-screen checklist

A screen is done when every line is a yes. The audit for a group quotes the lines it fails.

1. **The facts a decision needs are on the first view**; everything else is one tap away.
2. One main action, green, reachable by thumb (the + beside the menu); other actions are quieter.
3. The bar shows only what means something here; hidden over sheets and forms.
4. Every control is ≥ 44 × 44; nothing tappable is only an icon without an accessible name.
5. Text contrast ≥ 4.5:1; state never by colour alone.
6. Empty, loading, error and disabled are designed and worded.
7. Built only from the kit: no one-off sizes, radii, shadows or colours.
8. Rows say why they are in this order, and flag only what needs doing.
9. Forms: four fields or fewer at first, real labels, right keyboard, errors under the field, sticky main button.
10. Time to done for each daily job equal or lower than before (seconds by the formula; taps from `tapCount.spec.ts` beside it).
11. Works with 71 rows and with 0; long names truncate, never wrap the layout.
12. Focus order and Escape work; reduced motion respected.
13. The printed sheet is unchanged or better.
14. Started from a story in STORIES.md, and its taps meet the target there.
15. Anything that changes other things says so in a consequence line before the tap.
16. Anchors (Menu first, Search second, + last) sit where they sit everywhere else.
17. The maintainer has seen a before/after and walked it on their phone.
18. The job's wow bar score (STORIES.md) is 13 or more of 16, with no zero on time, facts or the sheet.
- **The stripe is the therapist; red is a row to fix** (7 Oct, #430; decided by Claude, to confirm): the stripe on a day row is its therapist's colour, keyed by a dot of the same colour beside each name in the By-therapist view. A row that must be fixed swaps it for a red stripe on a pale red fill, with the red flag line; no outline, so it is whole on every side and two in a row read as two.
- **The last day is the discharge** (7 Oct, #406; decided by Claude, to confirm): on a patient's leaving day the card opens on the Discharge summary bar, and the doctor's Next line reads "None · leaving today" with no prompt to book.
