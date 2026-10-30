# QA and release plan

Set by the maintainer on 26 Oct 2026 (#1178), before launch. Target: 2 to 10 new
centres a month, all hosted on the maintainer's Mac. Read this before changing
tests, releases, backups or hosting. How each test runs is in `testing.md`.

## Checks by kind of change

| Change | Before merge | Also |
|---|---|---|
| Wording, docs, look of a screen | builds, `tsc`, the ten `@smoke` tests | one after-shot (`scripts/uat-<issue>.mjs`) |
| Booking rules, planner, day sheet | the above and `npm run qa` | read the PDF (`pdftotext -layout`) |
| Database migration | the above | the migration runs on a copy of a real centre's backup (`scripts/migration-test.sh`, every Tuesday walk) |
| Docker, install, sign-up, updates | the above | a fresh install, and sign-up to wizard in under 3 minutes |
| Bug a centre reported | one test that fails without the fix | |

## The week (all run by Claude)

- **Monday 06:00:** security check and safe updates (scheduled task, exists).
- **Tuesday:** the release candidate gets the full nightly browser set, then Claude
  walks it in the browser pane at phone size as an admin would: the day, a booking,
  moving the on-leave therapist's treatments, sign-up to wizard, printing the sheets.
  Findings go to `~/ruta-data/MORNING.md`. A red finding stops Wednesday's release.
  The task's prompt is `hosting/tuesday-walk.md`; a green walk writes the version to
  `~/ruta-data/release-ok`, and only that version is released. No approval, no release that week.
  Before tagging `vX.Y.Z`, set `"version": "X.Y.Z"` in both `package.json` files
  (lockfiles inside `node:24-slim`) and merge that first; `scripts/check-version.mjs`
  fails CI on main once a tag is newer than the files (#1352).
- **Wednesday 20:00 IST:** every centre updates together (Babaji is treated like any
  other centre). Each centre's `/api/health` is checked; if any fails, every centre
  goes back to last week's app version, never the database, and MORNING.md's
  first line says so. Evening treatments end by 18:00, so the maintainer can check
  the same night and there is time before 07:00.
- **Thursday before 07:00:** Claude confirms every centre is healthy.

## Data

- Each centre is backed up every hour (48 kept, two days) and copied to R2 at :30,
  encrypted; one weekly copy kept 8 weeks. At most about an hour of data lost.
- If the Mac fails, centres are restored onto the Oracle VM (set up before launch, idle until then) with `hosting/failover.sh`, aim 1 to 2 hours.
  A restore drill monthly, its time recorded. Alarm when a centre has no backup
  for 2 hours.

## Limits and bugs

- Ceiling on the Mac: 25 centres, or 70% memory or disk. Past it, move to a paid
  server. The Monday report gives the numbers.
- Centre admins report by WhatsApp or helloayursen@gmail.com. The maintainer
  forwards it; Claude opens an issue, fixes it with a regression test, and it ships
  on Wednesday, or the same day if a centre cannot work.
- Launch gate: the full nightly browser set green once just before the first paying
  centre; advisory after that.

## Still to build, one PR at a time

1. ~~Weekly walk and release~~ (done: `provisioner/index.mjs` and `hosting/tuesday-walk.md`).
2. ~~Automatic app-only rollback when a health check fails after a release~~ (done: `provisioner/index.mjs`; by hand, `touch ~/ruta-data/rollback-now`).
3. ~~Migration test on a copy of a real backup~~ (done: `scripts/migration-test.sh`, step 3 of the walk).
4. ~~The 2-hour no-backup alarm in MORNING.md~~ (done: the hourly watch in `provisioner/index.mjs`).
