# Unattended session, 24 Oct 2026

One session, one PR open at a time, each from a fresh branch off `main`.

## Pull requests

| PR | What | Status |
|---|---|---|
| #1095, #1099, #822 | Dependabot: cloudflared, scorecard-action, setup-node | merged |
| #1094 | Dependabot: rclone 1.75 (`full` failed once on a smoke timeout unrelated to rclone; passed on rerun) | merged |
| #1131 | Book offers "Open the existing one" when the same therapy is booked twice (#1130) | merged |
| #1134 | A long patient name wraps in its field (#1132) | merged |
| #1138 | Plan next week: a swap switches its line on (#1133, reproduced) | merged |
| #1141 | Trial sign-up: about half stalled on "Creating…" until reloaded (#1139) | merged |
| #1142 | Therapist leave never moves a treatment through the whole of Lunch (#1135) | merged |
| #1143 | Discharge summary: Hindi letterhead lines print in Devanagari (#1136) | merged |
| #1144 | Get started: a centre that keeps no consultation room still books consultations (#1140) | merged |
| this | This note | auto-merge |

## Walk (seed-hidden state)

On a throwaway stack. Held: a 21-day stay (one-page discharge summary), a full house (New patient says "None free for these nights" and still adds), the day sheet with an 80-letter name (wraps, nothing cut), a 1-therapist 1-room centre from sign-up.

Found, filed `walk-found`:
- #1135 text-vs-server: three therapists on leave moved treatments through Lunch. Fixed.
- #1136 text-vs-server: Hindi letterhead lines printed as symbols. Fixed.
- #1137 cut text: an 80-letter name is cut on the discharge summary. **Open, stopped after two tries** (notes on the issue).
- #1139 first-day gap: sign-up stalled on "Creating…". Fixed.
- #1140 first-day gap: a one-room centre got no consultation from Get started. Fixed; decision in `decisions/2026-10-24-one-room-holds-consultations.md`, to confirm.

Guards: each fixed class is a server test that runs in `qa` on every PR (stronger than nightly): `replanSimulation` (Lunch), `discharge` (Hindi), `onboarding` (one room), `provisioner/test.mjs` (inbox order).

## #267

Sign-up to the end of Get started: 40 s scripted, shots in `docs/design/uat/2026-10-24-signup/`. Commented on #267. The full UAT on the trial VM is still Claude's to do there.

## For the maintainer

- Confirm the one-room decision (#1140): the first room kept in Get started takes the consultation's equipment.
- #1137 needs a next session (let the grid row grow), not a decision.
- Local only: the stale `reverent-bassi` worktree is clean on `main`; branches `claude/1124-pill`, `claude/973-wip`, `claude/final-check` deleted.
