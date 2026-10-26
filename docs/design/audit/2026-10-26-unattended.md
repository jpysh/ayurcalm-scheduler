# Unattended session, 26 Oct

- #1167, #1168, #1169: merged before the session started; no conflict left to fix.
- Nightly browser tests (#1166): green on 25 Oct after #1167 and closed. Nothing to triage.
- #1171 (closes #1164): a guest moved mid-stay changes guest room from a date; past nights stay in the old room and only the nights from the move are checked. Decision in `decisions/2026-10-26-guest-room-from-a-date.md`. Open, auto-merge on, server tests pass on a throwaway stack.

For the maintainer: nothing needed. The CI watcher switch for #1171 was refused by the app's permission check; auto-merge is on, so it merges when CI passes.
