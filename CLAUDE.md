# Working on AyurCalm Scheduler

Context for an AI assistant picking this up. Human contributors want
[CONTRIBUTING.md](CONTRIBUTING.md).

## What this is

A self-hosted appointment and therapy scheduler for wellness centres. Public,
MIT, maintained by one person (`jpysh`) roughly one pass a week. Built first for
residential Ayurveda centres; positioned to also fit massage studios, spas and
physiotherapy practices.

Being a **self-hosted, single-maintainer** project decides most design arguments:

- Anything a receptionist might change lives in the database and is edited in
  Settings. Environment variables are for install-time infrastructure only
  (`DATABASE_URL`, `JWT_SECRET`, `APP_PORT`). Never add a config file that has to
  be edited over SSH to change a business setting.
- One centre per install. A second centre runs a second container. Multi-tenancy
  is explicitly out of scope — it would touch every query for a benefit nobody
  has asked for.
- `docker compose up -d` must stay the entire install. If a change breaks that,
  the change is wrong.

## Layout

```
src/                    React 18 + Vite + TypeScript + Tailwind + shadcn/ui
  lib/apiBase.ts        THE API base URL. One definition. Do not add another.
  main.tsx              Global fetch wrapper: attaches the JWT, handles 401
  pages/AdminDashboard  The main screen; tabs live in pages/tabs/
  pages/SetupWizard     First-run flow, shown until settings.setup_complete
server/                 Express + Prisma + Zod, serves ../dist in production
  src/index.ts          Middleware order matters — see below
  src/auth.ts           bcrypt + JWT login, requireAuth
  src/settings.ts       Centre settings, requireAdmin, public support endpoint
  src/users.ts          User management, change-password
  src/seed.ts           Demo dataset (~120 patients, 3 months of appointments)
  src/scripts/          resetPassword.ts — lockout recovery
```

## Things that will bite you

**Middleware order in `server/src/index.ts`.** Rate limit → `/api/auth` →
`/api/public` → `requireAuth` → write limiter → routes. Only `/api/health`,
`/api/auth/login` and `/api/public/*` are unauthenticated. Adding a route that
must be public means adding it to the skip list *and* thinking about why.

**`ScheduleTab` renders only rows that contain appointments.** So a booking
outside the configured opening hours is invisible, not merely awkward. The grid
is built by `buildTimeSlots()` in `AdminDashboard.tsx` from the centre's
settings. Never reintroduce a hardcoded hour range.

**Prisma needs `binaryTargets`.** The Docker image is Debian; local dev is
usually macOS. `["native", "debian-openssl-3.0.x"]` is deliberate — removing it
breaks the container at runtime, not at build time.

**Lockfiles must be generated on Linux.** `npm install --package-lock-only` run
inside `node:24-slim`. A lockfile written on macOS omits Linux-only optional
dependencies and `npm ci` then fails in Docker and in CI.

**Migrations need the compose network**, because the db container publishes no
host port:

```bash
docker run --rm --network ayurcalm-scheduler_default -v "$PWD":/w -w /w \
  -e DATABASE_URL="postgresql://ayurcalm:ayurcalm@db:5432/ayurcalm?schema=public" \
  node:24-slim sh -c "apt-get update -qq && apt-get install -y -qq openssl && npx prisma migrate dev --name your_change"
```

**Settings PUT leaves absent fields alone.** Sending a partial object must not
null out what it omits — the setup wizard saves without the support numbers and
previously wiped them. An explicit empty string is how a field is cleared.

**`npm run lint` reports ~468 pre-existing `no-explicit-any` errors.** It is
advisory in CI for that reason. Do not add new ones; do not "fix" them in
unrelated PRs. Issues #1–#5 exist to clear them file by file.

## Before you say something works

Build both sides, then exercise it against the running stack:

```bash
npm run build && (cd server && npm run build)
docker compose up -d --build
curl -s http://localhost:8080/api/health
```

Log in for a token, then check the actual behaviour — not just that the code
compiles:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"demo1234"}' | jq -r .token)
```

Auth changes need a negative test as well as a positive one: an unauthenticated
call returning 401, and a staff-role call returning 403 where it should.

## Conventions

- Comments explain *why*, never *what*. If a line needs a "what" comment, rewrite
  the line.
- British spelling in user-facing text ("centre", "organisation").
- Zod validates every request body server-side. Client-side checks are a
  convenience, never the guard.
- Never return `password_hash` or reset tokens. `server/src/users.ts` uses an
  explicit field allow-list — copy that pattern.
- Commit messages: what changed and why, in prose. Reference issues with
  `Closes #N`.
