---
name: polish-batch
description: Do one screen group's cosmetic, wording and spacing fixes as a single pull request with a before and after sheet. Use when the maintainer reports cosmetics or asks for polish.
---
Polish is batched per screen group (Day, Patients, Team and Rooms, Leave, Settings, Guest rooms, printed sheets), never one PR per nit.
1. Find or create the group's tracking issue (label `polish`, milestone "Polish week (to 16 Oct)"). Every cosmetic the maintainer reports in chat is added to it as a checkbox, in their words, the same day.
2. Work in the group's own worktree. Read `docs/design/DESIGN.md` §3-§7 and the kit first: a fix is a kit change or a token, never a one-off size, colour or radius in a screen file. A fix that belongs to another group goes on that group's issue.
3. Take a **before** and an **after** shot of each fixed screen at 375x812, and at 200% text for anything with labels or rows, from one script `scripts/uat-polish-<group>.mjs` (the one place a before shot is worth it: the maintainer compares them).
4. Run `npx playwright test tests/e2e/phoneAudit.spec.ts` (tap targets, text size, overflow) on the stack; it is the guard against a kit change breaking another screen.
5. One PR, auto-merge on. Report to the maintainer in plain English: a table of each checkbox, done or not and why, with the before and after shot beside it. Tick the checkboxes; close the issue only when none is left.
