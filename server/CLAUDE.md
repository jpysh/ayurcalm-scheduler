# Server gotchas

Loaded when working in `server/`. The project-wide rules are in the root
`CLAUDE.md`.

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

**A treatment can have more than one therapist.** `staff_id` is the lead and
`co_staff_ids` lists everyone else. Anything asking "is this therapist busy"
goes through `teamOf()`, or a co-therapist reads as free and gets booked twice.
`Therapy.staff_required` is a refusal (`STAFF_SHORT`), not a preference.

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

**Diet resolution lives in `dietResolution.ts`, not in the PDF.** It decides what
a patient may eat: what was written for that date beats their own wording, which
beats the plan, and a treatment day uses a different side of the plan from a rest
day. It fails quietly — a wrong precedence prints a plausible sheet that is wrong
— so it is pure, and `npm run test:diet` covers it. CI runs that test; add to it
rather than around it.

**A diet segment points at its plan.** Editing a plan changes what everyone on it
eats. `overrides` on the segment is what one patient was told specifically and
must survive that edit. Never go back to copying the plan into the segment.

**Prisma needs `binaryTargets`.** The Docker image is Debian; local dev is
usually macOS. `["native", "debian-openssl-3.0.x"]` is deliberate — removing it
breaks the container at runtime, not at build time.

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

**Auth changes need a negative test as well as a positive one.** Log in for a
token, then check behaviour, not just that it compiles:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"demo1234"}' | jq -r .token)
```

an unauthenticated
call returning 401, and a staff-role call returning 403 where it should. The
seeded `staff@example.com` does not take `demo1234` — create a staff account
through `/api/users` as the admin when you need one, and check the data is
actually unchanged after the 403 rather than trusting the status code.

**Seeing the app at a size no demo has.** There is one dataset, not a demo one and a test one: a stress fixture kept
beside the demo would drift from it, and then a test passes on data no install
has. To see the app at a size no demo has, raise how much the seed books on an
empty database:

```bash
APP_PORT=8099 SEED_TREATMENTS_PER_ROOM=8 docker compose -p scale up -d --build
docker compose -p scale down -v     # when finished
```
