# Two hours without a backup raises the alarm (#1178)

Decided 27 Oct, from the release plan of 26 Oct ("alarm when a centre has no backup for 2 hours").
Backups are hourly, so the hourly watch flags a centre whose newest backup is over two hours old:
one missed backup, not a lost day as with the old 26 hours. The alert is emailed once, cleared once,
and shows on MORNING.md's Health line. A new centre gets two hours before its first backup counts.
