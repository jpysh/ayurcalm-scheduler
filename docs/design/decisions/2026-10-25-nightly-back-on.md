# The nightly browser tests run again, and red lines are cleared weekly by Claude
25 Oct 2026, decided by the maintainer (on Claude's recommendation).

The nightly workflow had been switched off by hand since 6 Oct, with no recorded reason, and it would have caught a header overlap at 200% text (#1150). It is on again. A red night files or updates the one open "Nightly browser tests" issue, and from now on it comments only when the list of failures changes, so the issue stays a short history and not a daily repeat. The weekly unattended session reads that issue first and clears it in one "test repair" PR: it fixes each real bug, or fixes or deletes each test that is wrong. The maintainer is told only when something needs their hands. No emails: the issue is the record.
