# Testing and pull-request checks

Moved out of CLAUDE.md (6 Oct). The summary and the rules that always apply are in CLAUDE.md; this is the detail.

**Test policy until launch (decided 6 Oct; supersedes the list below where they differ).**
Tests exist to protect the printed day sheet and the planner, not to pin every pixel while the screens
still change weekly. Before launch:
- **Blocks a merge:** builds, `tsc` at or under its count, `npm run qa` (the server rule tests: planner,
  availability, printed sheets, import/export and restore, auth, diet) and a *smoke* set of about six
  browser tests tagged `@smoke` (sign in, the day shows, book a treatment, print downloads a PDF,
  therapist off then fix then Undo, a new trial's wizard reaches the day). Nothing else blocks.
- **Advisory, run nightly and before a release, never fixed inside a feature PR:** every other browser
  test (audit4, phoneAudit, critical, tapCount and the rest). A red one becomes one issue; a session
  repairs them together in one weekly "test repair" PR. A feature PR does not edit them unless it is
  the PR that breaks the smoke set.
- **Screens are checked by the screenshot UAT**, not by new browser tests. Tap counts are a report, not a gate.
- **Locally run only** the smoke set and the server tests for the area changed. No full e2e per PR.
- **New tests:** a server rule or a bug fix gets one (a bug fix always does); a screen change gets none.
After launch (a real centre using it): server tests stay blocking; the smoke set stays blocking on every
PR; the full browser set runs nightly and before each release and blocks a release, not a PR; every bug
found by a user leaves one regression test; production watches (health ping, daily check, a monthly
restore drill from the backup, alerts to the maintainer) matter more than more browser tests.

**What to run before a pull request** (agreed 2026-09-27, while there are no
users). CI from a fresh database is the gate; don't repeat it locally.
- Always: front-end `tsc` (0 errors: `npx tsc -p tsconfig.app.json --noEmit`) and the tests for the area changed.
- Screen change: no browser suite locally (see the test policy above); drive the screen at 375px
  and run the screenshot UAT when it is big or visual. If you do run `playwright test --grep @smoke`
  locally, start the stack as CI does (`npm run qa` first, or
  `RATE_LIMIT_WRITES=1000 docker compose up -d --build`).
- Screenshots come from Playwright at 375×812 (`scripts/uat.mjs`, `scripts/walk.mjs`), not from the
  browser pane.
- Scheduler, planner or day sheet change: `npm run qa` locally too, and read the PDF.
- Every bug fix leaves one test that would have caught it.
- A `@smoke` test must not depend on the hour or on where the pointer rests: build its own
  problem on its own day. One that did broke CI for every pull request after 15:00 (#173).
- A large issue (a screen plus new server endpoints) goes in parts, merged in
  order: server with its test, then the screen with its tap counts, then any
  leftovers. The issue is ticked in #70 when its last part merges. Merge a part
  before building on it; never stack more than one open PR.
- A failure unrelated to the change: fix it in the same PR if it blocks the merge
  and takes under 15 minutes; otherwise note it in the PR and open a small issue
  in #70's order.

A test that needs a date builds its own fixed day in 2030, as `daySheet.test.ts`
does, never `new Date()` or the seeded day, which moves with today.

Looking at the PDF is part of the check:

```bash
pdftotext -layout day.pdf - | head -40      # is the text there at all
pdftoppm -png -r 75 -f 1 -l 1 day.pdf page  # is it where it should be
```

**Finish with a screenshot UAT, not a "check it yourself" list** (decided 5 Oct). Run it when a change is big or changes how something looks or moves; small or invisible changes (docs, tests, wording) need only the PR note, and several small changes may share one UAT. Polishing phase: one UAT per batch, before launch.
Claude does the maintainer's five steps itself at 375×812 with `node scripts/uat.mjs <date-slug>`
(edit its STEPS for the session): a screenshot and a pass/fail line per step in
`docs/design/uat/<date-slug>/README.md`, committed with the PR so it can be checked later. Report
the table, not instructions. Only a step that needs a human (a CAPTCHA, a real phone's print, a
password, an account) goes to the maintainer, one line each. Leave the app open in the browser pane
(signed in by API token, phone size) at the screen the work touched.

**Count the taps.** `tests/e2e/tapCount.spec.ts` prints each daily job's taps
beside the design's target. It is a report in the nightly run, not a gate. A session that
builds a job states before and after in the PR.
