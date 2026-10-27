# A release's migrations are tried on a real backup first (#1178)

Decided 27 Oct, from the release plan of 26 Oct. Every Tuesday walk restores the newest real centre
backup into a throwaway stack, starts the candidate on it, and checks health and that no table lost
rows. A failure is red: no release that week. Backups are only read. It runs every week, not only
when a migration changed, because a seed or start-up change can break a real database too.
