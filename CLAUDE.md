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

## Who you are working with

The maintainer is solo and non-technical. They know the centre and the product;
they do not read code and should not be asked to.

So: decide the technical questions and say what you decided, in plain English.
Ask only what is theirs to know — the centre, the business. Do the work rather
than handing back steps; when something genuinely needs their hands (a password,
a hosting dashboard), say what to type and where, in one line. Verify against the
running app and say what you actually looked at: "tests pass" is not "I read the
sheet".

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
  src/seed.ts           Demo and test dataset (120 patients, 4 months of
                        appointments, residents with diet plans). Settings →
                        Reset demo data rebuilds it from today
  src/dietTemplateSeed.ts  The starting diet plans, seeded by name
  src/availability.ts      When a therapist is not free — events, absences, the
                        more-specific-event rule. Pure, and tested
  src/appointmentGuard.ts  Whether one appointment may sit where it is put
  src/replan.ts            `planDay` — the one planner: an absent therapist's
                        whole day, or whatever Verify found wrong, in one pass
  src/dayCheck.ts          What is wrong with a day and the one plan that fixes
                        it. The header and Verify read it and decide nothing
  src/dietResolution.ts    What one patient eats on one day — pure, and tested
  src/dietTemplates.ts     Diet plan CRUD, admin-only writes
  src/scripts/          resetPassword.ts — lockout recovery
```

## Things that will bite you

**Middleware order in `server/src/index.ts`.** Rate limit → `/api/auth` →
`/api/public` → `requireAuth` → write limiter → routes. Only `/api/health`,
`/api/auth/login` and `/api/public/*` are unauthenticated. Adding a route that
must be public means adding it to the skip list *and* thinking about why.

**PDFKit paginates overflowing text, silently.** `doc.text()` that does not fit
the page adds one and carries the text there; `doc.rect()` does not. That is how
the day sheet came to print boxes with no words in them for a whole release. Any
change to `dailySchedulePdf.ts` must break the page *before* drawing a row that
will not fit, and must be checked by generating a PDF and looking at it — the
code does not throw when it is wrong.

**Express 5 forwards rejected async handlers to the error middleware.** Routes
are async and validate with Zod; a thrown error becomes a 500, not a crashed
process. Wildcard routes use Express 5 syntax: `/{*path}`, not `*`.

**Availability is decided on the server, and only there.** `availability.ts`,
`appointmentGuard.ts` and `scheduler.ts` say who is free; `replan.ts` says what
to do when someone is not; `dayCheck.ts` answers "what is wrong with this day"
by asking both. Two screens once re-implemented those rules in the browser and
both were wrong within a release — the booking dialog threw away every valid
slot once meals became four-hour windows, and Verify reported a clean day while
`PUT /appointments` refused four of its treatments. Both copies are gone (#88).
A screen asks the server; it never decides for itself, and
`npm run test:day-check` fails if `/day-check` and the write ever disagree.

**Gender match and room amenities are refusals, not preferences.** The scheduler
always avoided proposing them; since #88 `appointmentGuard` refuses them too, so
nothing can arrive by another route. Gender matching still honours the Settings
switch. The only rule an admin may switch off in Verify is a resident's own
therapist, and it lives in the planner — relaxing it widens the search and can
never book what the guard refuses.

**A therapy has one length, and it includes the room's cleaning time.**
`buffer_minutes` is gone. It was a second number nobody could see — not in
Therapies, not on the day sheet — enforced by the scheduler and the replan but by
nothing that refuses a booking, so an edited treatment could sit inside another's
cleaning time and no screen said so. A centre that runs treatments back to back
sets a length with no cleaning time in it.

**The day is planned in one pass, never once per problem.** `checkDay` asks
`planDay` once for everything that has to move, so two answers cannot take the
same room at the same minute — asked separately, two treatments clashing over one
room were both told to move to 12:00. A row the admin changes becomes a pin and
the rest is planned again around it, so what is on screen can always be accepted
whole. `npm run test:day-plan` asserts all of that, plus that Undo restores the
day exactly.

**"Today" is the centre's day, from `Settings.timezone`.** The seed, the
schedule, the warnings, the invariants test and the day sheet all work it out
the same way, and the default is `Asia/Kolkata`. Machine time is never the
answer: on a laptop behind the centre after 18:30 UTC, a UTC "today" put the
seeded absence on yesterday and headed the 17th's schedule with the 16th.

**The seeded day carries its problems on purpose.** A therapist on leave with
four treatments still on their name, spaced so a swap has somewhere to go, and
a resident who may only be treated by one therapist. They are what the
reassignment exists for, so a seed change that quietly fixes the day has broken
the dataset.

**Diet resolution lives in `dietResolution.ts`, not in the PDF.** It decides what
a patient may eat: what was written for that date beats their own wording, which
beats the plan, and a treatment day uses a different side of the plan from a rest
day. It fails quietly — a wrong precedence prints a plausible sheet that is wrong
— so it is pure, and `npm run test:diet` covers it. CI runs that test; add to it
rather than around it.

**A diet segment points at its plan.** Editing a plan changes what everyone on it
eats. `overrides` on the segment is what one patient was told specifically and
must survive that edit. Never go back to copying the plan into the segment.

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

## The local copy you look at

One stack, started from the repo, so it shows up in Docker Desktop as
`ayurcalm-scheduler` and nothing else has to be remembered:

```bash
npm run dev:up        # build the current code and start it on http://localhost:8080
npm run dev:logs      # watch what the app is doing
npm run dev:down      # stop it, keeping the data
npm run dev:reset     # throw the data away and seed a fresh centre
```

`dev:up` after a code change rebuilds and restarts, so the browser shows what
the repo currently says. Sign in with `admin@example.com` / `demo1234`.

Run a second stack only for a throwaway check, and name it so it cannot be
confused with the one above — `docker compose -p <name> ... down -v` when
finished. A second long-lived stack on another port is how you end up testing
last week's code without noticing.

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
call returning 401, and a staff-role call returning 403 where it should. The
seeded `staff@example.com` does not take `demo1234` — create a staff account
through `/api/users` as the admin when you need one, and check the data is
actually unchanged after the 403 rather than trusting the status code.

`docker compose up -d --build` reuses the running container when the image has
not changed, so it will not pick up anything you patched inside the container
while debugging. Use `--force-recreate` before believing a clean result.

`npm run qa` runs every server test inside the app container, after an
`up --build` so it tests the code in the checkout, and prints one plain-English
line per test. `npm run qa:fresh` does the same on a freshly seeded centre. CI
runs `qa` plus `npm run test:e2e` (sign-in, every tab, the day sheet, in
Chromium) on any pull request that touches `server/` or the Docker files, and on
every merge; other pull requests get the builds and the database-free tests only.

A test that needs a date uses a fixed day far from the seeded months, never
`new Date()`: a clock-dependent date once failed only on Thursday afternoons.

There is one dataset, not a demo one and a test one: a stress fixture kept
beside the demo would drift from it, and then a test passes on data no install
has. To see the app at a size no demo has, raise how much the seed books on an
empty database:

```bash
APP_PORT=8099 SEED_TREATMENTS_PER_ROOM=8 docker compose -p scale up -d --build
docker compose -p scale down -v     # when finished
```

Looking at the PDF is part of the check:

```bash
pdftotext -layout day.pdf - | head -40      # is the text there at all
pdftoppm -png -r 75 -f 1 -l 1 day.pdf page  # is it where it should be
```

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

## How a session works here

Sessions are driven from GitHub issues: **#70 is the roadmap and
lists them in order, one issue per session.** "Work on #N" is the whole brief —
read that issue, do it, close it, and tick it off in #70. Never re-open or redo a closed session issue; if it
needs more, open a new one that builds on it.

Everything below applies to every session without being restated.

**Verify the premise before building on it.** Findings in our own issues have
been wrong. #55's highest-ranked finding claimed the scheduler was broken and it
was not — the API booked correctly the whole time. Reproduce the problem
yourself first. If it does not reproduce, say so and stop, rather than fixing
something that works.

**There are no users.** Nobody runs this in production. Delete dead code and
dead fields rather than deprecating them, change the schema when the schema is
wrong, and write no compatibility shims for installs that do not exist. The only
data that must survive is the demo seed.

**Write less prose, everywhere.** Issues, PR bodies, CLAUDE.md and the docs are
read by an agent in a later session and by a maintainer who does not read code —
not by a team, and not by anyone who needs convincing. Under 3,000 characters:
what changed, why, what was verified, what was skipped. No tables of contents, no
restating the brief, nothing written to impress a reader who is not there.
README.md and CONTRIBUTING.md are the exception: a stranger on GitHub reads
those.

**Keep the change revertible.** One PR per session, small enough that
`git revert` on the merge commit undoes it cleanly. If the work turns out bigger
than the issue implies, stop and say so before expanding scope.

**Finish with a "check it yourself" list** — at most five steps, each one
something the maintainer clicks or looks at, never code to read. A session is not
done until someone who cannot read the diff can confirm it worked.

**Design for the admin's phone.** One operator, one centre, and they may never
open a desktop after setup.

**The printed day sheet is the product.** A screen change either improves it or
leaves it alone.

**Out of scope, settled:** patient self-booking, payments, marketplace,
marketing and loyalty, multi-location, payroll, GST billing. The reasoning is in
#53 §2 and §5 — read it before proposing any of them again.
