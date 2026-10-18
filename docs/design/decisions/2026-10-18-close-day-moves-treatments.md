# Closing a day with bookings warns, then offers to move them to the next open day
18 Oct 2026, #933 (audit F-day-1). Decided by the maintainer; the technical shape decided by Claude, to confirm.

Before a day is closed, the sheet says how many treatments are booked on it. Two buttons: "Close and move them" and "Close, leave them". Moving is one pass of `planDay` per closed day (`moveOffClosedDays`), which never offers a closed day, written through the guard as one batch with a 5 second Undo; Undo reopens the day and puts every treatment back.

Only a move inside the resident's stay is taken. A resident whose stay ends on the closed day is left where they are and counted ("8 could not be placed"), for the admin to decide.

The reason is optional and saved empty, never as "Closed" (the day check read "closed for Closed"). The week plan says "The centre is closed on <day>", not "No free time".
