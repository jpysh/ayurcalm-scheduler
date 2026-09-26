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
  pages/AdminDashboard  The shell: shared data, the day's warnings, Verify, and
                        which screen is showing
  components/BottomBar  The phone frame (#66): menu · day · print · book, and
                        the bottom sheets they open. Screens are reached from it
  pages/tabs/           One file per screen: its tab, dialogs and useXScreen()
                        state hook. Shared types and helpers: tabs/shared.ts
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
  src/mcp.ts               The AI assistant's door at /mcp (#119, spec #102):
                        grouped tools that call the functions above and
                        decide nothing. src/mcpb/proxy.cjs is the Claude
                        Desktop extension Settings hands out
  src/scripts/          resetPassword.ts — lockout recovery
```

## Things that will bite you

Server-only ones (middleware, PDFKit, Express 5, co-therapists, refusals, diet,
Prisma, migrations, Settings PUT, auth checks) are in `server/CLAUDE.md`, which
loads when you work in `server/`.

**Availability is decided on the server, and only there.** `availability.ts`,
`appointmentGuard.ts` and `scheduler.ts` say who is free; `replan.ts` says what
to do when someone is not; `dayCheck.ts` asks both what is wrong with a day. A
screen asks the server and never decides for itself: two browser copies of these
rules were both wrong within a release (#88). `npm run test:day-check` fails if
`/day-check` and the write disagree.

**The day is planned in one pass, never once per problem.** `checkDay` asks
`planDay` once for everything that has to move, so two answers cannot take the
same room at the same minute. A row the admin changes becomes a pin and the rest
is planned around it. `npm run test:day-plan` asserts that, and that Undo
restores the day exactly.

**"Today" is the centre's day, from `Settings.timezone`** (default
`Asia/Kolkata`), everywhere: seed, schedule, warnings, tests, day sheet. Never
the machine's clock or UTC.

**The seeded day carries its problems on purpose.** A therapist on leave with
three or four treatments still on their name, spaced so a swap has somewhere to go, and
a resident who may only be treated by one therapist. They are what the
reassignment exists for, so a seed change that quietly fixes the day has broken
the dataset.

**The schedule grid is `components/DayGrid.tsx`, built for a phone.** Its hours
come from `buildTimeSlots()` (the centre's settings), stretched to any booking
outside them, so no treatment is ever off the grid. Never reintroduce a
hardcoded hour range. "Who is free" reads `GET /staff-day`, which applies the
guard's leave and event rules; the browser only compares times.

**Lockfiles must be generated on Linux.** `npm install --package-lock-only` run
inside `node:24-slim`. A lockfile written on macOS omits Linux-only optional
dependencies and `npm ci` then fails in Docker and in CI.

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
the repo currently says. If the build fails it says so and restarts nothing. Sign in with `admin@example.com` / `demo1234`.

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

`docker compose up -d --build` reuses the running container when the image has
not changed, so it will not pick up anything you patched inside the container
while debugging. Use `--force-recreate` before believing a clean result.

`npm run qa` runs every server test inside the app container, after an
`up --build` so it tests the code in the checkout, and prints one plain-English
line per test. `npm run qa:fresh` does the same on a freshly seeded centre. CI
runs `qa` plus `npm run test:e2e` (sign-in, every tab, the day sheet, in
Chromium) on any pull request that touches `server/` or the Docker files, and on
every merge; other pull requests get the builds and the database-free tests only.

A test that needs a date builds its own fixed day in 2030, as `daySheet.test.ts`
does, never `new Date()` or the seeded day, which moves with today.

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

**Guardrails.**
- Two strikes: if the same fix fails twice, stop and tell the maintainer what you
  tried and what you think is wrong. No third attempt.
- A slow build or test run is fine. Re-running a check without changing
  anything is a loop: stop.
- Found something outside the issue? Open a small issue, place it in #70's
  order, and leave it out of this PR.
- Finish by merging the PR once CI is green, ticking #70, giving the "check it
  yourself" list, and writing the prompt for the next session (under 15 lines,
  one code block) from what you learned.

**Verify the premise before building on it.** Findings in our own issues have
been wrong (#55's top finding was). Reproduce the problem first; if it does not
reproduce, say so and stop.

**There are no users.** Nobody runs this in production. Delete dead code and
dead fields rather than deprecating them, change the schema when the schema is
wrong, and write no compatibility shims for installs that do not exist. The only
data that must survive is the demo seed.

**Write less prose, everywhere.** Issues, PR bodies and docs are read by a later
agent and a maintainer who does not read code. Under 3,000 characters: what
changed, why, what was verified, what was skipped. README.md and CONTRIBUTING.md
are the exception.

**Keep the change revertible.** One PR per session, small enough that
`git revert` on the merge commit undoes it cleanly. If the work turns out bigger
than the issue implies, stop and say so before expanding scope.

**Finish with a "check it yourself" list** — at most five steps, each one
something the maintainer clicks or looks at, never code to read. A session is not
done until someone who cannot read the diff can confirm it worked.

**Count the taps.** `tests/e2e/tapCount.spec.ts` prints each daily job's taps
beside the design's target. A session that builds a job states before and after,
and adds the job to `BLOCKING`.

**Design for the admin's phone.** One operator, one centre, and they may never
open a desktop after setup.

**Build to the approved phone design.** `docs/design/phone.html`, approved in
#144 (decisions in its comments): click through it at phone width before touching
a screen. Phone is the primary layout; a desktop only widens it. The old desktop
screens are not a reference. The mock-up's data and planner answers are made up;
the real ones come from the server.

**The printed day sheet is the product.** A screen change either improves it or
leaves it alone.

**The app first, the AI second.** Every admin job must work in the app on a
phone with no AI. MCP (#100) is an optional second door onto the same server
rules, built after the job's screen, and waits until #70's admin list is done.

**Out of scope, settled:** patient self-booking, payments, marketplace,
marketing and loyalty, multi-location, payroll, GST billing. The reasoning is in
#53 §2 and §5 — read it before proposing any of them again.
