# Tuesday walk (#1178)

The prompt of the scheduled task "Weekly: Tuesday walk (AyurCalm)", Tuesdays 10:00 India time.
Its approval is what Wednesday's 20:00 release ships; without it the week is skipped.

---

Weekly release walk for AyurCalm. The owner has no coding experience and reads
/Users/webserver/ruta-data/MORNING.md each morning.

1. In /Users/webserver/code/Ranikhet/ayurcalm-scheduler run `git fetch -q origin main`, note
   `git rev-parse origin/main` as the candidate, and make your own worktree of it under
   `.claude/worktrees/tuesday-walk-<yyyy-mm-dd>`. Never edit, switch branch or commit in the main folder.
2. Start it as a throwaway stack: `COMPOSE_PROJECT_NAME=walk APP_PORT=8398 RATE_LIMIT_WRITES=1000
   RATE_LIMIT_CALLS=10000 docker compose up -d --build --wait`, then wait for `/api/health`.
   Never touch :8080 or any `ruta-*` stack.
3. Run `bash scripts/migration-test.sh` (the candidate's migrations on a copy of the newest real
   backup, in its own throwaway stack on :8396). Then run `npm ci` and `npx playwright test` (the full nightly browser set) against it.
4. In the browser pane at phone size, signed in as admin@example.com / demo1234, walk as an admin
   would: today's day, a new booking, moving the on-leave therapist's treatments, sign-up to wizard
   (on the throwaway stack only), printing the day sheet (read it with `pdftotext -layout`).
5. Red = a FAIL from the migration test or a failing test in step 3, or anything in step 4 that would stop a centre working or print
   a wrong sheet. Open one issue per red finding.
6. If nothing is red, write the candidate's full sha to /Users/webserver/ruta-data/release-ok
   (one line). If anything is red, delete that file.
7. `docker compose -p walk down -v`, remove the worktree.
8. Put one line at the top of MORNING.md, under its heading:
   `Walk (<Tue 3 Nov>): <sha7> approved for Wednesday 20:00` or
   `Walk (<Tue 3 Nov>): STOP - <finding, under 15 words> (issue link); no release this week`.
