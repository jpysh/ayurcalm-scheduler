# Rooms held for a group fill from the organiser's list (27 Oct)

Decided in the unattended stays session for #1196 part 2, on the maintainer's 26 Oct brief.

- A hold is a number of rooms per type for the group's dates, kept on the group (Patients › Groups), not on any room. Which rooms are held is worked out each night: the first empty rooms of the type, so a hold never blocks a room someone is already in.
- Everyone outside the group sees a held room as taken ("Held" on Guest rooms, `ROOM_HELD` when picked). The group's own guests may take it.
- "Add guests from the organiser's list" is the spreadsheet import with the group's name and dates: each guest is given the next held room, and the hold shrinks as it fills. Names without dates take the group's.
- Moving the group's dates moves its holds too. Setting a type to 0 lets those rooms go.
