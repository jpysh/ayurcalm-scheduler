# Weekly release on Wednesday at 20:00 IST after Claude's UAT walk, hourly backups, a 25-centre ceiling
26 Oct 2026, #1178, decided by the maintainer.

The whole plan is in `docs/qa-plan.md`. The maintainer wants at most one or two hours of a centre's day lost, so backups and the R2 copy are hourly instead of nightly. Claude walks the release candidate as a real admin on Tuesday; every centre, Babaji included, updates together on Wednesday at 20:00 IST, so the maintainer can check that night; a failed health check rolls every centre back to the previous app version, never the database. Left out: a live standby server, and staged rollouts (every centre gets the same release).
