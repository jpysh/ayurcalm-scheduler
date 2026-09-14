# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-09-14

The day sheet reads row by row, the demo data lasts four months, and no dependency advisories remain.

### Changed
- **Day sheet** — each patient's row holds everything for them; treatment notes
  moved from the end of the sheet into a **Notes** column. Long names shorten
  with `..` instead of breaking mid-word
- **Demo data** covers four months; **Settings → Reset demo data from today**
  rebuilds it
- Ailments tab marked coming soon: it never saved (#34)
- Express 5, react-router 7, Vite 8; `npm audit` reports no advisories

### Fixed
- Malformed or oversized request bodies return 400/413, a missing record 404,
  instead of 500
- Merged day-sheet cells could spill text above their box

### Tests
- End-to-end suite replaced with four tests against a real install, run in CI

## [0.2.0] - 2026-09-11

The day sheet a centre prints and pins up now works, and diet plans are real.

### Added
- **Diet plans in the database** — a plan is a reusable record with its own meals
  for a day with treatment and for a rest day, plus medication and notes on
  eating around treatment. Written in the Diet tab under **Plans**, without
  having to start assigning it to somebody. Writes are administrator-only;
  anyone signed in can read, so a receptionist can still assign one
- **Assignments follow their plan** — a patient's segment points at a plan rather
  than copying it, so correcting a plan reaches everyone on it. Anything written
  for one patient stays theirs and is left alone by that correction. Editing a
  plan says how many patients it will reach before you save
- **Retire instead of delete** — removing a plan patients are on retires it: it
  stops being offered and their sheets keep printing
- **Three starting plans** — an everyday sattvic plan, internal oleation
  (snehapana) and the graduated return to food after purification (samsarjana
  krama), seeded on first run and editable in the app. Placeholders for a
  centre's own; sources are listed in `server/src/dietTemplateSeed.ts`
- **Meals on the daily schedule PDF** — each patient's own breakfast, lunch and
  dinner print in the columns the day already has, resolved from what was written
  for that date, then their plan, choosing the treatment-day or rest-day side by
  whether they are being treated. The last column carries what is specific to
  them; how to eat around treatment prints once under the table
- **Residents get a row** — someone staying at the centre appears on the sheet on a
  day with no therapy booked, because their meals are still theirs
- Sessions survive a restart without `JWT_SECRET` set: a secret is generated once
  into the database and read back
- The Diet tab lists residents rather than every patient ever registered

### Fixed
- **The daily schedule PDF printed an empty grid** — boxes where appointments
  belonged with no therapy, staff or room name in any of them, over nine pages
  for a single day. Rows were drawn before the page-break check, and PDFKit
  paginates text that overflows a page while leaving the stroked boxes behind
- **A malformed request body crashed the API** — Zod threw inside an async handler,
  which Express 4 does not pass to error middleware, so Node exited. Every signed-in
  user was logged out by the restart. Validation failures now answer 400
- Columns no longer shrink below their own heading or their longest word, so
  '07:30' and 'Dr. Priya Chatterjee' stay intact; the table takes a smaller type
  size instead of breaking words
- The per-process session secret came from `Math.random`; it is the CSPRNG now
- Diet plans saved in the app never reached the server, so they did not survive a
  refresh and could not be assigned
- The Diet tab forgot every assignment on reload, showing a dash where a patient
  had a plan

### Removed
- **Patient and therapist share links** (`/patient/:token`, `/staff/:token`). The
  token in the URL was read and then ignored — both pages fetched the whole
  patient or staff list and rendered the first row, so every link showed the same
  person. See #19 for the patient link as a feature, and #20 for a per-therapist
  printed sheet in place of the therapist one

### Added (earlier in this cycle)
- **User accounts** — administrators can add, edit, deactivate and delete logins,
  and set a password for someone who has lost theirs. The last active
  administrator cannot be demoted, deactivated or deleted, and nobody can delete
  their own account
- **Change your own password** — available to every signed-in user, including staff
- **First-run setup wizard** — an administrator signing in to a new install is
  asked for the centre's name, opening hours and working days, then chooses
  whether to keep or clear the seeded example data. Timezone is detected from
  the browser
- **Support contacts** — two WhatsApp numbers seeded from
  `DEFAULT_SUPPORT_WHATSAPP` and editable in Settings. Product support is shown
  to signed-in staff; the centre's own number is kept for the patient link, which
  is not built yet (#19), so it appears nowhere today
- **Password recovery for a self-hosted install** — `resetPassword.ts` sets a new
  password from the server's shell, and the login screen explains how
- **Settings page** — centre name, address, logo, opening and closing time, slot
  length, working days and timezone, edited in the app rather than in files
- **Clear demo data** — removes the seeded example centre from Settings, keeping
  user accounts and centre settings
- Administrator-only enforcement on settings writes; staff accounts get read-only

### Fixed
- Saving settings without the support numbers no longer clears them, so the
  setup wizard does not wipe the configured contacts
- The schedule grid was hardcoded to 09:00–18:00 in 30-minute steps, so
  appointments outside those hours were invisible. It is now built from the
  centre's configured opening hours

## [0.1.0] - 2026-09-05

First public release.

### Added
- One-command Docker install: `docker compose up -d` builds the front end and API
  into a single image, applies migrations, and seeds demo data into an empty database
- Server-side authentication: bcrypt password hashes, JWT sessions, and a guard on
  every API route except `/api/health` and `/api/auth/login`
- Seeded demo administrator (`admin@example.com` / `demo1234`) with a startup warning
  while the default password is unchanged
- Scheduling across therapists, rooms and therapies, with conflict detection
- Auto-assign pass respecting room amenities, therapist availability and time off
- Patients and stays, diet plans, centre and per-therapist time off
- Recurring programme events and one-off sessions
- Printable daily schedule PDF
- Audit log of scheduling changes

### Changed
- The API base URL is resolved once in `src/lib/apiBase.ts` instead of in nine
  separate files, and the Vite dev server proxies `/api`

[0.3.0]: https://github.com/jpysh/ayurcalm-scheduler/releases/tag/v0.3.0
[0.2.0]: https://github.com/jpysh/ayurcalm-scheduler/releases/tag/v0.2.0
[0.1.0]: https://github.com/jpysh/ayurcalm-scheduler/releases/tag/v0.1.0
