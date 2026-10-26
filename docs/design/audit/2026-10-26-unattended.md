# Unattended session, 26 Oct

- #1167, #1168, #1169: merged before the session started; no conflict left to fix.
- Nightly browser tests (#1166): green on 25 Oct after #1167 and closed. Nothing to triage.
- #1171 (closes #1164): a guest moved mid-stay changes guest room from a date; past nights stay in the old room and only the nights from the move are checked. Decision in `decisions/2026-10-26-guest-room-from-a-date.md`. Open, auto-merge on, server tests pass on a throwaway stack.

For the maintainer: nothing needed. The CI watcher switch for #1171 was refused by the app's permission check; auto-merge is on, so it merges when CI passes.

## Evening session, 26 Oct

- #1171 and #1172: merged, CI green.
- Nightly browser tests: the latest issue (#1166) is closed green from 25 Oct; tonight's run has not reported yet.
- Walk of guest rooms after #1171 (moves mid-stay, Undo, out-of-use rooms, shortened stays): four findings, each its own issue.
  - #1174, fixed in #1175 (merged): shortening a stay to end before its move put every night in the new room.
  - #1177, fixed in #1181 (open, auto-merge on): the out-of-use warning checked the room moved to, not the room of each night.
  - #1182, fixed in #1183 (open, auto-merge on): a room left in a move could be deleted, wiping the stay's earlier room.
  - #1184 (open, not fixed): Undo of a shortened stay drops a planned room move. Needs Undo to send the stay's rooms back; next session.
- The guest rooms sheet and the day sheet on the move day were already covered by #1171's tests; not walked again.

For the maintainer: nothing needed.
