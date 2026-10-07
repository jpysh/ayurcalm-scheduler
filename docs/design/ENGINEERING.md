# ENGINEERING.md — what keeps a live centre safe

Claude's list, ranked by harm to a live centre (Task A, 6 Oct; audited in Task B on a throwaway stack,
7 Oct, approved by the maintainer). Evidence is what was run and read. Fixes are the Audit track in #70.

| # | Check | Verdict | Fix |
|---|---|---|---|
| e1 | Backup and restore actually restore | Pass | One-line restore in the README; Backups reminds to copy one off the machine weekly |
| e2 | Upgrades keep a live centre's data | Pass | None |
| e3 | Every write is in the audit log | Fail | #411 |
| e4 | Rules live only on the server | Fail | #409 |
| e5 | Tests cover the top 50 | Friction | #409, plus one test with each search and Log fix |
| e6 | The day opens fast on a phone | Friction | #416 |
| e7 | Screens match stories, no dead code | Friction | #410, #408 (CLAUDE.md line) |
| e8 | Private links and sign-in are safe | Friction | #410, #417 |
| e9 | The printed sheet survives a full centre | Pass | #414 (plan grouping) |
| e10 | The centre's clock, not the machine's | Pass | None |

## Evidence

**e1 Backup and restore.** A backup written 10 minutes after start restored into an empty database with
psql, 0 errors; row counts equal per table, an md5 of every pre-backup appointment identical. Gaps:
restore is a terminal job, backups sit on the same computer, Settings says "No backup yet" for the first
10 minutes.

**e2 Upgrades.** Built 78f4dc4 (32 migrations) on the full seed, started the current image on the same
database: 42 migrations finished, rows unchanged, the 8 Oct sheet 59 treatments before and after.

**e3 Audit log.** 78 write routes. AuditLog is written only by patient update and delete, appointment
update and delete, the replan and accept, and MCP. After seven writes in the walk the table still had
the four seeded rows.

**e4 Server rules.** No availability or clash logic in `src/`. But `appointmentGuard.ts` checks weekly
hours with `hoursOn()` and `replan.ts` and `dayCheck.ts` never did, so the planner proposed a therapist
on her day off and the guard refused the save. `test:day-check` had no weekly-hours case.

**e5 Tests.** `npm run qa` on the full seed: 38 of 39, the failure being e4 (weekday-dependent). About 25
of the 47 stories have a test that fails if they break; none for sharing, kitchen, patients in typed
search, week counts, follow-up, records, open days, or the Missing stories.

**e6 Speed.** Slow 4G and 4× CPU, full seed, 375×812: day rows at 2.3 s, the inbox 1.8 s after its tap.
905 KB and 39 API calls on open; the 520 KB script is sent uncompressed with `max-age=0`.

**e7 Dead code.** Kit exports `lbl` and `Field` unused. Server routes nothing calls:
`POST /patients/cleanup-duplicates`, `/staff/cleanup-duplicates`, `/appointments/cleanup`,
`/rooms/rename-simple`, `DELETE /appointments`, `POST` and `PUT /feedback`. CLAUDE.md named
`components/DayGrid.tsx`, now `DayList.tsx`.

**e8 Security.** Good: every data route 401 without a token, no hash or reset token in any response, a
renewed link's old token 404, a therapist's link cannot write another's treatment, nosniff, frame DENY,
no-referrer. Problems: `DELETE /api/appointments` with no date deletes every treatment for any signed-in
user, unlogged; sign-in has no attempt limit beyond the global cap; no Content-Security-Policy.

**e9 Print.** Busiest full-seed day, 80 treatments: patient sheet 5 pages, rota 5, doctor 1; all 80
time-and-therapy pairs found by `pdftotext`; no row split across a page. One flaw: the same diet plan
prints as two groups when notes differ.

**e10 Clock.** Container at 19:18 UTC Tue, 00:48 Wed in India: the day, the Menu, the inbox, the sheet
and the links all said Wed 7 Oct.
