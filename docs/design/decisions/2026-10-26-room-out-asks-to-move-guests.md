# A guest room taken out of use lists its guests with a room for each
26 Oct 2026, #1188 and #1187, decided by the maintainer.

Taking a room out of use (a leak, no power) is allowed even with guests in it. The app then lists each guest sleeping there on those nights with a suggested free room (same type first, roommates together) and one tap to move them. Retiring a room works the same way for guests from today on. The admin decides; the app does the searching. Not refused and not moved automatically.

Retiring, as built for #1187: Remove appears once the list is empty, and the server refuses a remove while anyone is left. Past guests keep the room, so it is retired, not deleted. Two guests may be offered the same room; the second tap is then refused and the list reloads with another. Lowering a room's beds below the guests already booked from today on is refused, naming the first over-full night and who sleeps there (#1186).
