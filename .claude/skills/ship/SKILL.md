---
name: ship
description: Take one change from issue to merged on AyurCalm Scheduler. Use for any fix or feature before opening a pull request.
---
1. **Issue first.** `gh issue create` (plain prose, under 3,000 characters) and use the number it prints everywhere; never guess one.
2. **Own worktree and branch** (`claude --worktree` or EnterWorktree), from `origin/main`, so parallel sessions and a dirty tree never collide. `cd` into it in every command.
3. **Build the change**, then check it: `npx prisma generate` in `server/` after a pull, `npx tsc -p tsconfig.app.json --noEmit`, `(cd server && npx tsc --noEmit)`, the one server test for the area, `pdftotext -layout` on any changed PDF. A screen that changed visibly: its own `scripts/uat-<issue>.mjs`, one after-shot at 375x812 on a throwaway stack (see `docs/testing.md`), committed in `docs/design/uat/<date>-<slug>/`. Never append to `scripts/uat.mjs`.
4. **Record**: a decision goes in its own `docs/design/decisions/<date>-<slug>.md`; a story change in `docs/design/STORIES.md`.
5. **Open the PR** (body under 3,000 characters: what changed, why, verified, skipped; end with the attribution line from the session) and **turn auto-merge on** (`gh pr merge N --auto --squash`). Do not wait for CI; start the next issue.
6. A conflict or red check comes back as an event: `git merge origin/main` into the branch (never rebase a pushed branch), keep both sides of any appended doc line, fix, push. After a squash merge never rebase onto the old branch; `git rebase --onto`.
7. When a theme ends, write the next-session prompt (under 15 lines) on the maintainer's list (#439).
