# DESIGN.md — the AyurCalm phone app

The admin app on a phone, 375 wide first. One operator, one hand, often standing. Every rule below is
either a number to use or a question to answer; if a screen needs a rule this file lacks, add it here
first (#285). Screens come from the ten stories in [STORIES.md](STORIES.md), walked back from the
outcome the admin wants, never from today's screens. Layout borrowed from awesome-design-md's format;
values are ours. Sources read (rounds 1 and 2): Apple HIG (layout, iOS 26 tab bar and bottom search,
sheets, 17pt body / 15pt secondary), Material 3 Expressive (shorter bar, FAB menu instead of stacked
FABs), Airbnb (one shadow, 4px base, soft radii, a host "Today" home), Baymard (mark required *and*
optional, inline validation with a positive check, labels above, progressive disclosure), NN/G on iOS 26
Liquid Glass (controls that appear and vanish, crowded targets and text over busy backgrounds all hurt),
and Atlassian's DESIGN.md test (agents rebuild components instead of reusing: so §7 names the kit).

## 1. Principles

1. **The facts a decision needs are on the first view.** Everything else is one tap away, never zero taps of clutter.
2. **One main action per screen**, green, at the thumb. Everything else is quieter.
3. **Say what will happen** before a tap, and what did happen after it. No spinners that redraw the sheet.
4. **Flag only what needs doing.** A row with no flag is fine; a row with a flag is an instruction.
5. **Tap counts never go up.** A job that gets longer must buy something the admin asked for.
6. **The printed day sheet is the product.** A screen change improves it or leaves it alone.
7. **Start from the story.** A screen exists because a story in STORIES.md needs it. A screen no story needs is deleted.
8. **Stable anchors.** Controls the admin has learned never move; only the extras between them come and go (NN/G: controls that appear and vanish break learning).

## 2. Colour roles

Green stays. Colour means one thing each; never decorative.

| Role | Token | Value | Use |
|---|---|---|---|
| Text | `--foreground` | #1F2A30 | body, names |
| Muted | `--muted-foreground` | #5B6A70 | secondary lines (4.5:1 on card) |
| Faint | `--faint` | #8A979C | finished, disabled, placeholders (never for needed facts) |
| Surface | `--background` | #F4F7F2 | page |
| Card | `--card` | #FFFFFF | lists, sheets |
| Sage | `--secondary` | #E3ECE0 | pressed, selected, quiet fills |
| Primary | `--primary` | #3D6B4F | the one main action, selected state, links |
| Border | `--input` | #7A8E7F at 45% | field outlines (visible as a box) |
| Line | `--line` | #E6ECE3 | hairlines between rows |
| Alert | `--alert` | #A94A26 on #FBEAE3 | something must be fixed or chosen now |
| Notice | `--notice` | #6E4A0E on #FBF0D9 | done for you, or worth a look |
| Now | `--now` | #C2410C | the current time only |
| Therapist colours | `--t-*` | phone.html | identity stripe on rows; never red, orange or green-primary |

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

Two weights per screen at most beyond 400: 600 for what you tap or scan, 700 for the title.

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
| Focus | 2px primary outline, 2px offset (keyboards and switches); fields also a soft 3px halo. |

## 7. Components (all live in `src/components/kit.tsx`)

- **Bottom bar** (adaptive, two floating pieces, no white between them). Left: a capsule of Menu · Search (on the day, plus the date). Right: **+**, and on the day Print beside it in its own small capsule. 56 high, 10 from the edges, ≥ 96% opaque card, the one shadow. Hidden while a sheet, form or the keyboard is open.
  - Anchors: Menu is always the first slot, + always the last, Search always second, at the same pixels on every screen. Only the date and Print come and go.
- **+ (adaptive).** 50px green circle, always a plus. It adds what the screen is about: day → treatment, Patients → patient, Leave → leave, Team → therapist / room / therapy (a small choice sheet). Editing is a tap on the thing itself. Its accessible name says what it adds ("New patient").
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
- **Choice +.** When + can add several kinds of thing (Team), it opens a small sheet of choices (a FAB menu), never a second button.
- **Change line.** A label on the left, its value on the right, a `›` when it can change ("Therapist · Priya ›"). One tap opens the phone's own list (`LineSelect`, `LineDate`) laid invisibly over the whole line; free choices come first and busy ones stay listed, greyed and disabled, with why ("Asha · has a treatment"), so a clash is never picked by accident. The same line, with no list, is a card's row with an arrow (Diet, Therapies, Stay, Details); a faint value says nothing is decided yet.
- **More details.** A folded row, "More details · phone, passport… (optional) ›", for what a form does not need to start. Fields inside say "(optional)".
- **Search field in a sheet.** When a sheet starts by finding someone, its foot holds the field (`SearchField`, above the keyboard) and the list above it shows at most five suggestions; typing replaces them with matches.
- **Quick dates.** Today and Tomorrow as two chips above the phone's calendar row (`QuickDates`), for any change that usually starts now: a diet, a stay.
- **Preselected best option.** A picker opens with the sensible choice already ticked and in view (the package nearest the stay's length), so the common case is one tap on the foot. Money is `rupees()`: "Rs 70,750", whole rupees, always marked as reference.
- **Sheet foot and link row.** A sheet's foot is `SheetFoot`: the main button names the outcome ("Add the room"), a quiet destructive line under it for what exists. A list that leads somewhere else starts with `LinkRow` ("Standard therapies · Add from the library ›"). Delete asks in a sheet that says what goes with it, never a dialog.
- **Settings parts.** The front door is groups of `Row`s that say their own state ("Last backup 2 hours ago"), with one sheet each; a long sheet is headed parts (`SectionHead`) and one Save. A rule is a `SwitchRow`: name, one line of state, the switch, and its "when" inline in the sentence as a value that opens the phone's own list; a changed value is amber (`--notice`). A record is `EntryRow`s under a day (the Log). An inbox item is an `ItemRow`: what it is, its facts, its actions under it. A screen's gear (`PageHead gear`) opens the rules for what that screen raises.
- **Kit first.** Before writing markup for any of the above, use or extend `src/components/kit.tsx`. A one-off size, colour, radius or shadow in a screen file is a defect.
- **Chips and segments.** Chips: filters and multi-choice. Segments: one of 2–4 in view.
- **Toast.** Above the bar, dark, one line, one action (Undo). 5 seconds.
- **Pill.** Floats above the bar only while something is waiting; says how many and what kind.

## 8. Patterns

- **Booking is one sheet.** Who (search at the bottom, at most five suggestions: no treatment yet today, then recent) → everything else fills in place and stays editable: therapy (last one, with its date), date, time, therapist, room. The button names the outcome. No loading flash, no long lists.
- **Nothing is forced.** A patient can be added with four fields; diet, package, accommodation, consultation and details are rows with arrows, filled when the admin decides. Discharge printing is never blocked by missing data.
- **Cancelled, never removed.** Anything the admin ends (a treatment after a shortened stay, a leave-affected slot) is marked cancelled with a reason and kept in the patient's record and audit trail.
- **Decisions sit where they belong**: the suggestion is in the free slot, the fix is on the problem row.
- **Confirm by undo, not by asking**, except for removal of history or anything that cannot be undone.
- **Language:** "patient" (never "resident"), British spelling, sentence case, times in 24-hour, dates "Wed 30 Sept". No jargon, no raw ids, no snake_case.

## 9. Per-screen checklist

A screen is done when every line is a yes. The audit for a group quotes the lines it fails.

1. **The facts a decision needs are on the first view**; everything else is one tap away.
2. One main action, green, reachable by thumb; other actions are quieter.
3. The bar shows only what means something here; hidden over sheets and forms.
4. Every control is ≥ 44 × 44; nothing tappable is only an icon without an accessible name.
5. Text contrast ≥ 4.5:1; state never by colour alone.
6. Empty, loading, error and disabled are designed and worded.
7. Built only from the kit: no one-off sizes, radii, shadows or colours.
8. Rows say why they are in this order, and flag only what needs doing.
9. Forms: four fields or fewer at first, real labels, right keyboard, errors under the field, sticky main button.
10. Taps for each daily job equal or lower than before (`tapCount.spec.ts`).
11. Works with 71 rows and with 0; long names truncate, never wrap the layout.
12. Focus order and Escape work; reduced motion respected.
13. The printed sheet is unchanged or better.
14. Started from a story in STORIES.md, and its taps meet the target there.
15. Anything that changes other things says so in a consequence line before the tap.
16. Anchors (Menu first, Search second, + last) sit where they sit everywhere else.
17. The maintainer has seen a before/after and walked it on their phone.
