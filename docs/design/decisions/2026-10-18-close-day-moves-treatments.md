# Closing a day with bookings warns, then offers to move them with Undo
18 Oct 2026, audit #933. Decided by the maintainer.
Before a day is closed, the app says how many treatments sit on it and offers "move to the next open day". The move is planned in one pass (planDay) and has the usual 5 second Undo. Closing without moving stays possible.
