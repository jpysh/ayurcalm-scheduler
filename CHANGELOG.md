# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
