---
name: walk
description: Run a time-boxed exploratory walk of AyurCalm Scheduler on state the seed hides, file each finding by class, and add a guard for any class a machine can check. Use before a release or after about ten merged pull requests in one area.
---
Walks found 148 of the issues of 5-9 Oct; per-PR screenshots found almost none. 60-90 minutes, one charter.
1. **Charter** in one line: area, risk, condition (a brand-new centre; a Sydney or New York centre near midnight; after closing; 200% text; a phone in another zone). Read the open `walk-found` issues first so nothing is filed twice.
2. **Scratch centre**, never :8080: `RUTA_DATA=<scratch> PORT=8202 CENTRE_PORT_FROM=8390 node provisioner/index.mjs` (the live one owns :8200; never `pkill -f provisioner`), or `docker compose -p <name>` with `APP_PORT`, `RATE_LIMIT_WRITES=1000 RATE_LIMIT_CALLS=10000`. Check `docker ps` for the port first; export env in the same command.
3. **Clock without waiting:** Playwright `timezoneId` for the phone, `page.clock.setFixedTime(new Date('<ymd>T21:30:00+05:30'))` for after closing; a script computes "today" in the centre's zone, never UTC.
4. Screenshots with Playwright at 375x812 (the browser pane clips to ~600 px). Read what is on screen against the server's own numbers, not only how it looks.
5. **File each finding** (`gh issue create`, labels `walk-found` plus `bug` or `polish`, milestone) with the class: clock, text-vs-server, first-day gap, cut text, wording. Fix the bugs one PR each (`ship`); cosmetics go to the `polish-batch` issues.
6. **Guard:** when a class can be checked by a machine (a zone matrix, a count compared to the server's, text cut at 200%), add it to the nightly set in `tests/e2e/` and the table in `docs/testing.md`, so the next walk does not find it again.
7. Write the scores and findings in `docs/design/walk/` notes only if the maintainer asks; otherwise the issues are the record.
