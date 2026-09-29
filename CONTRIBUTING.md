# Contributing to AyurCalm Scheduler

Thanks for taking a look. Bug reports, feature ideas and pull requests are all
welcome.

## Reporting a bug or requesting a feature

Open an issue — there are templates for both, and they ask for the details that
usually decide whether a bug is reproducible. For security issues, see
[SECURITY.md](SECURITY.md) instead.

## Getting set up

```bash
git clone https://github.com/jpysh/ayurcalm-scheduler.git
cd ayurcalm-scheduler
docker compose up -d db     # Postgres on :5432

cd server && npm install
npx prisma migrate deploy
npx tsx src/seed.ts
npm run dev                 # API on :4000

cd .. && npm install
npm run dev                 # UI on :5173
```

Sign in with `admin@example.com` / `demo1234`.

## Making a change

1. Fork the repo and branch from `main`.
2. Make the change. Match the surrounding style — the codebase is TypeScript,
   two-space indent, and uses the existing shadcn/ui components rather than new
   UI dependencies.
3. Check it still builds and passes:
   ```bash
   npm run lint
   npm run build
   npm test                                   # self-contained tests
   docker compose up -d && npm run test:e2e   # sign-in, tabs, an edit that persists, day sheet
   cd server && npm run build && npm run test:all   # adds the tests needing a database
   ```
4. Open a pull request describing what changed and why. Screenshots help for UI
   changes.

CI runs lint, both builds, a Docker image build, the end-to-end tests and the
database tests on every pull request.

`npm run lint` currently reports around 470 pre-existing `no-explicit-any`
errors, so it is advisory in CI rather than blocking. Please don't add new ones —
and a PR that clears a batch of the existing ones is very welcome.

## Database changes

Schema changes go through Prisma:

```bash
cd server
# edit prisma/schema.prisma, then:
npx prisma migrate dev --name describe_your_change
```

Commit the generated migration folder along with the schema change. Never edit
an existing migration that has already been merged.

## Things worth knowing

- `server/src/index.ts` mounts middleware in order: rate limiting, then auth,
  then the route table in `server/src/server.ts`. Only `/api/health` and
  `/api/auth/login` are unauthenticated.
- The front end calls plain `fetch`; the session token is attached globally in
  `src/main.tsx`, so individual call sites do not deal with auth headers.
- `server/src/seed.ts` builds the demo dataset. It is idempotent for the admin
  user but otherwise assumes an empty database.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## What the tests cover

`npm test` runs only what is self-contained: diet resolution and day-sheet text fitting. `cd server && npm run test:all` adds three that need a running install: `test:invariants` (no therapist, room or patient double-booked; rooms have the amenities their therapies need; gender matching holds; nothing outside opening hours), `test:validation` (null fields in a request body are handled, not a 500) and `test:auto-assign` (the scheduler books a course of sessions).

Those last two write to the database and tidy up afterwards, so they refuse to run unless it is marked as demo data. Point `DATABASE_URL` at a test install, or set `ALLOW_TEST_WRITES=1` if you are certain.

The front end always calls `/api` on its own origin. In development Vite proxies that to `http://localhost:4000` (override with `VITE_API_PROXY_TARGET`); `VITE_API_BASE` points a built app at another host.
