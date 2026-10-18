# Audit charter, 18 Oct 2026

Independent end-to-end audit of the admin experience on a phone. Read-only on
code: auditors file findings, they do not fix.

## The user

One admin at Babaji, a residential Ayurveda centre. Peak: about 100 patients
across 3 weeks, so 40 to 70 in house on a given day, 10 to 15 therapists.
Today they have no software: they print patient schedules and therapist day
sheets from paper or a word processor. The app must beat that on the first day.

Phone: middle-to-high-end Android (Chrome), 412x915 CSS px, device scale 2.6;
also check 360x800. Wi-Fi or patchy 4G. British English. One thumb, often
standing, often interrupted (a therapist asks a question mid-task), sometimes
in a hurry at 6:30 am or at the evening review.

## Stacks (throwaway, seeded with `SEED_SIZE=babaji`, 74 patients)

- Screens agent: http://localhost:8218
- Stories agent: http://localhost:8219
- Sign in: admin@example.com / demo1234. Sign in through the API token as
  `scripts/uat.mjs` does, except once to audit the login screen itself.
- Do not touch :8080 or any other port.

## Rules for every auditor

1. Judge cold first: look at the screen, write what you would think as the
   admin, only then read `docs/design/DESIGN.md`, `STORIES.md`, `decisions/`.
   A finding that contradicts a settled decision is marked `REOPENS <file>`.
2. Evidence or it did not happen: every finding cites a screenshot file, the
   exact steps, and what you saw. "Looks cluttered" is not a finding.
3. Human behaviour, not a robot: note mis-taps (targets under 44 px, taps near
   the thumb edge), what the admin must remember, what happens when they get
   interrupted and come back, what happens when they tap twice, go back,
   rotate, lose signal, or type the wrong thing.
4. Bar for a proposal: it must cut at least one tap or one decision on a daily
   job, remove a screen, or fix a wrong or unsafe result. Otherwise log it as
   `cosmetic, skip`. Wow ideas must need no new dependency and no new screen.
5. Every proposal states: taps before and after, cost S/M/L, story served.
6. British spelling. Plain words. Under 3,000 characters per finding.
7. Read the printed sheets with `pdftotext -layout`, not by eye.
8. Do not edit anything outside `docs/design/audit/2026-10-18/`. Do not commit.

## Finding format

    ### F-<area>-<n> <title>
    Severity: blocks a job / slows a daily job / annoys / cosmetic-skip
    Story: sNN (or "none")
    Steps: 1. ... 2. ...
    Saw: ... (shots/<file>.png)
    Why it matters to the admin: ...
    Proposal: ... Taps before -> after: N -> M. Cost: S/M/L.
    REOPENS: <decision file> (only if it does)

## Time model

`seconds ~ taps x 0.5 + typed characters x 0.3 + decisions x 1.35 + waiting`.
Report taps (exact), the estimate, and a human note: where the admin would
hesitate, re-read, or need to remember something.
