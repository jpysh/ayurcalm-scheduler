# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **User accounts** — administrators can add, edit, deactivate and delete logins,
  and set a password for someone who has lost theirs. The last active
  administrator cannot be demoted, deactivated or deleted, and nobody can delete
  their own account
- **Change your own password** — available to every signed-in user, including staff
- **First-run setup wizard** — an administrator signing in to a new install is
  asked for the centre's name, opening hours and working days, then chooses
  whether to keep or clear the seeded example data. Timezone is detected from
  the browser
- **Support contacts** — two WhatsApp numbers, shown to different audiences:
  product support for signed-in staff, and the centre's own number on the
  patient and therapist share links. Both seeded from
  `DEFAULT_SUPPORT_WHATSAPP` and editable in Settings
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
- Patient and therapist share links no longer redirect to a login form they
  cannot use (see #16 — those pages still need token-scoped endpoints)
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

[0.1.0]: https://github.com/jpysh/ayurcalm-scheduler/releases/tag/v0.1.0
