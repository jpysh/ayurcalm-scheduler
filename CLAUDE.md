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

Front end in `src/` (React, Vite, Tailwind; `AdminDashboard` is the shell, `components/BottomBar` the phone frame, `pages/tabs/` one file per screen, `components/kit.tsx` the only UI kit). Server in `server/src/` (Express, Prisma, Zod; planner `replan.ts`, rules `availability.ts` and `appointmentGuard.ts`, day check `dayCheck.ts`, MCP `mcp.ts`). The full map, file by file, is `docs/architecture.md`; read it when you need to find something.

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
three or four treatments still on their name, from morning to at least 18:00 so an evening visitor still sees it (#369), and
a resident who may only be treated by one therapist. They are what the
reassignment exists for, so a seed change that quietly fixes the day has broken
the dataset.

**The day is `components/DayList.tsx`, built for a phone:** hour groups of the
server's appointments, regrouped by therapist, room or patient; the list only
sorts, so no treatment is ever hidden. Hours come from `buildTimeSlots()` (the
centre's settings); never reintroduce a hardcoded hour range. "Who is free"
reads `GET /staff-day`, which applies the guard's leave and event rules; the
browser only compares times.

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

## Tests and checks (detail: `docs/testing.md`)

- **Blocks a merge:** builds, `tsc` at 0 errors (`npx tsc -p tsconfig.app.json --noEmit`), `npm run qa` (server rule tests) and the ten `@smoke` browser tests. Nothing else blocks.
- **Advisory, nightly (issue "Nightly browser tests"):** every other browser test and the tap-count report. Never fixed inside a feature PR; one weekly "test repair" PR clears them.
- Screens are checked by a screenshot UAT (`node scripts/uat.mjs <date-slug>`, committed to `docs/design/uat/`), not new browser tests. Run it for a big or visual change.
- Locally run only the smoke set and the server tests for the area changed. A bug fix always leaves one test. Dates in tests are a fixed day in 2030, never `new Date()`.
- Start a local stack for browser tests with `RATE_LIMIT_WRITES=1000 RATE_LIMIT_CALLS=10000`. After `docker compose up --wait`, also wait on `/api/health` (the first start is still seeding).
- Scheduler, planner or day-sheet change: `npm run qa` and read the PDF (`pdftotext -layout`).
- After launch the full browser set blocks a release, not a PR; every user-found bug gets a regression test.

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

Sessions are driven from GitHub issues: **#439 is the maintainer's short list (#70 is the
history), and the milestone "Polish week" holds the current work.** "Work on #N" is the whole brief —
read that issue, do it, close it, and tick it off in #439. Never re-open or redo a closed session issue; if it
needs more, open a new one that builds on it.

Everything below applies to every session without being restated.

**Guardrails.**
- Two strikes: if the same fix fails twice, stop and tell the maintainer what you
  tried and what you think is wrong. No third attempt.
- A slow build or test run is fine. Re-running a check without changing
  anything is a loop: stop.
- A large issue goes in parts merged in order; never stack more than one open dependent PR. A failure unrelated to the change: fix it in the same PR if it blocks the merge and takes under 15 minutes, else open a small issue.
- Found something outside the issue? Open a small issue, place it in #70's
  order, and leave it out of this PR.
- Open the PR with auto-merge on (the `main needs CI` ruleset requires `fast`, `scope`
  and `full`); GitHub merges it when they pass, so go on to the next issue and do not
  wait. A conflict or a red check wakes the session: merge `main` in, fix, push. Tick
  the maintainer's list (#439; #70 is the history) and write the next-session prompt
  (under 15 lines, one code block) when a session ends.
- **Create the issue first and use the number it returns** in code comments, docs and
  the PR; a guessed number (#522, #561) was wrong twice and had to be rewritten.

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

**Three loops check the work** (reasons in `docs/testing.md`, "Loops"; the steps are project skills in `.claude/skills/`): *every PR* is cheap: tests, `tsc`, CI, and for a visibly changed screen one after-shot from its own `scripts/uat-<issue>.mjs` (never the shared `uat.mjs`) (skill `ship`); *walks* are scheduled, chartered and on state the seed hides, and each machine-checkable class becomes a nightly guard (skill `walk`); *polish* is batched one screen group per PR with a before/after sheet (skill `polish-batch`). Only a step that needs a human goes to the maintainer, one line each.

Leave the app open in the browser pane, signed in by API token, phone size, on the screen the work touched.

**Count the taps.** `tests/e2e/tapCount.spec.ts` prints each job's taps against the design's target (a report, not a gate); a session that changes a job states before and after in the PR.

**Record every decision, keep sessions focused** (6 Oct, revised 9 Oct). A decision made in chat becomes a GitHub issue plus **its own file** in `docs/design/decisions/` (see its README) before the session ends; `DESIGN.md` keeps the rules and the decisions up to 9 Oct. Before asking, grep issues, `DESIGN.md` and `decisions/`. One theme per session; with auto-merge on there is no PR count to stop at: stop when the theme is finished or a decision is the maintainer's, log the decisions on the maintainer's list, and write the next prompt there (under 15 lines), not only in chat. Run `npx prisma generate` in `server/` before `tsc` after a pull, or the stale client prints dozens of false errors.

**Design for the admin's phone.** One operator, one centre, and they may never
open a desktop after setup.

**Design system and stories (#285).** Before touching any screen read
`docs/design/DESIGN.md` (rules, kit, 18-line checklist) and the story it serves in
`docs/design/STORIES.md`. Start from the story's outcome, never from the current
screen; build only from `src/components/kit.tsx`, and extend it rather than write
a one-off. Until the closing session of #285 only `qa` and the tap-count check
block a merge; the rest of e2e is advisory.

**Build to the design system.** `docs/design/DESIGN.md` is the authority (the bar, the menu, headers
and the kit have moved on from the mock-up). `docs/design/phone.html`, approved in #144, is history
only. Phone is the primary layout; a desktop only widens it. The old desktop screens are not a
reference.

**The printed day sheet is the product.** A screen change either improves it or
leaves it alone.

**The app first, the AI second.** Every admin job must work in the app on a
phone with no AI. MCP (#100) is an optional second door onto the same server
rules, built after the job's screen, and waits until a real centre is live on
the app and has given feedback (#194).

**Out of scope, settled:** patient self-booking, payments, marketplace,
marketing and loyalty, multi-location, payroll, GST billing. The reasoning is in
#53 §2 and §5 — read it before proposing any of them again.
