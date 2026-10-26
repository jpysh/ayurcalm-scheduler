# Stay and guest-room jobs: UX audit, 26 Oct 2026

Walked at 375×812 with Playwright on a throwaway stack (`walkstay`, :8391), signed in by API token, centre day Tue 27 Oct. Shots (not committed) are in the session scratchpad `ux/`. The stack was reseeded mid-walk by another session; jobs after the PDF ran on the fresh seed. Earlier the stack also held leftover test rooms (R357330-*, SIM46512*, U628080*), which made the lists long; that is a fair stand-in for a 60-room centre.

Taps are counted from the Patients list (or the Guest rooms screen for room jobs). A phone date or list picker counts as 2 (open, done). Typing a name counts as one tap for the field.

Already open and not repeated below: #1184, #1186–#1192, #1198.

## Summary

| Job | Taps now | Target | Verdict |
|---|---|---|---|
| Book a new resident with a room | 4 (defaults) – 8 (own dates) | 4–6 | Good |
| New stay for a returning guest | 11 | 6 | Slow; room is a second trip (#1190) |
| Extend a stay | 5 | 4 | Good, wording wrong on a clash |
| Shorten a stay | 5 (3 for "Leaves today") | 4 | Good |
| Move room mid-stay | 5 | 4 | **Blocked for most rooms** (picker reads past nights) |
| Did not arrive + Undo | 3 + 1 | 3 + 1 | Fast but destructive with no line before the tap |
| Mark a guest room out of use | 8 | 5 | Buried two sheets deep |
| Add guest rooms / retire one | 5 / 3 | 5 / 4 | Add is good; retire is too easy |
| Is a room free? | 3–5 | 3 | Good, a long flat list |
| Guest rooms sheet PDF | 3 | 3 | Good, one gap on shared rooms |

## 1. Book a new resident with a room (s1, s26)

**Now 4 taps → target 4–6.** Patients + → New patient → name, gender → Add patient. Dates default to today and a fortnight; the cheapest free room is preselected; the consultation is booked; the toast says it all with Undo ("Uxaudit Rao added, R357330-0, consultation Tue 27 Oct 09:45").

Works: four fields, a sensible preselected room, one toast with Undo. This is the best job in the group.

Problems:
- *Slows.* Changing the length takes 2 phone-picker taps. Smallest fix: Quick dates chips under Leaving: "7 · 14 · 21 nights".
- *Cosmetic.* The Guest room list is one native list: free rooms, then "Not yet", then taken rooms as "T1 · Aarohi Khan · Tue 27 Oct" (a bare date with no "from"). Fix: put "Not chosen yet" first or last, and write "taken from Tue 27 Oct".
- *Cosmetic.* The toast names the room without its type ("R357330-0"); the card says "Trishul House · R357330-0". Use the card's words.

## 2. New stay for a returning guest (s34)

**Now 11 taps → target 6.** Search, type, result → Stay → New stay (Arrived, Leaving: 4) → Add the stay → Accommodation → type → Use.

Works: search finds the guest at once ("Not in house"); the toast names the consultation.

Problems:
- *Slows* (#1190). No room on New stay; the admin has to go back to Accommodation, where **nothing is preselected** (New patient preselects the cheapest free room). Smallest fix: the New patient guest-room line in the New stay sheet, preselected.
- *Slows.* The guest's last room is not offered first. Aditya's old room T2 was free; the sheet chose R357330-1.
- *Cosmetic.* A future stay's first date is labelled "Arrived" in New stay and in the Dates sheet before arrival. Say "Arriving" until the day.

**Wow:** "Same as last time: T2, 14 nights, Panchakarma 14" as one preselected line; New stay becomes search → result → Stay → Add (4 taps).

## 3. Extend a stay (s19)

**Now 5 taps → target 4.** Card → Dates → Leaving → Stay until Sat 14 Nov. The consequence line is good: "4 days longer. Meals carry on to Sat 14 Nov. Accommodation: 24 nights, Rs 38,400. Package: 21 days; the stay is now 25."

When the room is booked after the old leaving day (Vihaan Chatterjee in T3, Ananya Khan arriving Thu 29 Oct) the line says "Saving moves them to R357330-1 for the whole stay." The save moves him **from today**, and the earlier nights stay in T3 (checked on the Guest rooms screen), so the line is wrong. Most centres would rather keep him in T3 and move Ananya, who has not arrived yet; that is #1192.

Problems:
- *Never wrong (wording).* "for the whole stay" is false since #1164. Say "from tonight; T3 to make up".
- *Slows.* The foot says "Stay until Sat 31 Oct" and the toast says "Vihaan: Thu 22 Oct to Sat 31 Oct". Neither mentions the room move. Put the move in both.
- *Slows.* Quick chips: "+1 night · +3 · +7" above Leaving.

## 4. Shorten a stay (s19)

**Now 5 → target 4** ("Leaves today" is already 3). The line names the cancelled treatment and keeps it in the record; the toast says "1 treatment cancelled"; Undo restored the dates. Good.

- *Cosmetic.* The line does not say the room frees ("T6 free from Sat 31 Oct"), which is half the reason the admin shortens a stay.

## 5. Move room mid-stay (s26)

**Now 5 taps → target 4, but blocked.** Card → Accommodation → Guest room list → room → Use.

Problems:
- **Blocks the job.** The Guest room list checks every night of the stay, past ones too. For Aarohi Khan (in since Mon 19 Oct) only T1, T11 and T12 were offered. T9 read "Meera Iyer · Mon 19 Oct", a night already over, though T9 is free from tonight. The type counts agree with the list ("Nanda House · 0 free"). The server has accepted such moves since #1164; the sheet asks the wrong question. Fix: build the list and the counts from the move date (today), the same nights the save checks.
- *Slows.* Nothing on the sheet says when the move happens. Add a consequence line, "Moves tonight. T1 to make up, T11 to ready", and say the same in the toast (now "Aarohi: Trishul House · T11").
- *Cosmetic.* The retired T6 is still in the list as a taken room.

**Wow:** start from the Guest rooms screen. Long-press or tap a guest → "Move to…" lists free rooms tonight to the end of the stay, same type first, roommates together (#1191).

## 6. Did not arrive + Undo

**Now 3 + 1 → target 3 + 1.** Card → Dates → Did not arrive. Toast: "Aditya did not arrive: stay removed, 16 treatments cancelled · Undo". Undo restored Vihaan Das completely.

Problems:
- *Never wrong.* One tap cancels 16 treatments with no consequence line before it (checklist 15), and the only way back is a 6-second toast. Smallest fix: the tap shows the line in place ("Cancels 16 treatments and frees T2 from tonight") with the foot "Mark as not arrived"; Undo stays.
- *Never wrong.* Afterwards the card reads "Not staying today · add a stay" with no trace of the no-show. DESIGN §8 says "Cancelled, never removed". Keep the stay as "Did not arrive, Tue 27 Oct" in the card's history.
- *Slows.* The job lives inside Dates. The natural place is the Arriving today row on Patients, the evening the guest has not come.

## 7. Mark a guest room out of use (s53)

**Now 8 taps from Guest rooms → target 5.** Guest rooms · Names and beds → T6 → Not available… → Until → Reason → Save.

Works: the line naming who is in it ("Meera Reddy is in it then and will need another room. It waits under need you"); the confirmation in the sheet ("Available again · From now; Undo puts it back"); "Not available: Leak in the bathroom · until Thu 29 Oct" on the Guest rooms row; the badge count rises.

Problems:
- *Slows.* Two sheets deep. A room row on the Guest rooms screen opens New patient or the guest's card, never the room. Fix: a free room's row opens the room sheet with "Out of use…" and "Add a patient" both on it.
- *Slows* (#1188). The guest is flagged, not offered a room.
- *Cosmetic.* The control is called "Not available…" (the patient card's leave row uses the same words). The story and the sheet say "out of use". Call it "Out of use for some days…".
- *Cosmetic.* The Reason field has no accessible name (checklist 4).

## 8. Add / retire guest rooms (s51)

**Add: 5 taps → 5.** "H7–H8", type, Add → toast "2 guest rooms added: H7 to H8". Excellent.

**Retire: 3 taps, too few.** Names and beds → T6 → Remove T6. T6 had Meera Reddy in it until 10 Nov. It was removed with **no sheet, no consequence line and no toast** I could see. The room left the Names and beds list but stays on the Guest rooms screen and the sheet with her in it.

- *Never wrong.* DESIGN §7: "Delete asks in a sheet that says what goes with it." Fix: Remove opens a sheet ("Meera Reddy sleeps here until Tue 10 Nov. Retire after she leaves, or move her") with the destructive foot. #1187 and #1188 cover moving the guests; the missing sheet is new.
- *Cosmetic.* Names and beds orders types alphabetically (Special Apartments first). The Guest rooms screen and the sheet order them by price. Use one order.

## 9. Is a room free? (s20)

**Now 3–5 → target 3.** Arriving → Leaving (fills a fortnight on) → a room → New patient with dates and room. "33 free for all 7 nights, Wed 28 Oct to Wed 4 Nov", grouped by type with counts.

- *Slows.* Every free room is a 56 px row ("Add a patient ›"). With 30 free rooms the second type is three screens down. Fix: per type, one row with the free names inline ("T9, T11, T12 ›") that opens the first.
- *Slows.* No price on the result, though price is often the enquiry's next question. Put "Rs 1,600 a day" on the type header.
- *Wow:* "None free for all nights?" Show the near-misses: "T9 free except Thu 29 Oct". The admin can then say yes with a move.

## 10. Guest rooms screen and sheet: the room picture (s20, s52)

The screen: "33 free tonight", a week strip, one line ("Leaving today: T2, N10 to make up · Arriving: T2, N2"), then every room by type. The sheet (pdftotext of 27 and 29 Oct) is a strong page: counts, "Make up first, someone arrives into: T2", tick boxes where there is work, shared rooms on one line.

Problems:
- *Never wrong.* A shared room where one bed leaves and another guest arrives the same day is left out. On Thu 29 Oct A2 (Sai Banerjee leaves, Aarohi Verma arrives) is in "To make up 1" and its row says "ready a bed for Aarohi Verma". But the sheet has no "Make up first" line, and the screen line says only "Arriving: T3, N3, A2". On Wed 28 Oct A1 is missing from "Leaving … to make up" in the same way.
- *Never wrong (clarity).* The screen names guests by first name: on Tue 27 Oct "Vihaan arrives" is on R357330-1 (Vihaan Chatterjee's move) and on N2 (Vihaan Das). A move reads as "arrives" in one room and "leaves today" in the other. Fix: full names on arrive and leave, and "moves in from T3" / "moves to R357330-1".
- *Cosmetic.* On the sheet T2 reads "Make up, then ready for Aditya Chatterjee", with no word of Diya Mishra leaving; N10 does name its leaver.
- *Slows.* The Patients list and the card's first view never show the room ("Day 1 of 14 · leaves Mon 9 Nov"). The room is the last row under Stay, below the fold. Add "· T2" to the row and to the card's subtitle.
- *Slows.* One row per room does not give a picture of the week. **Wow:** a compact tape chart on the Guest rooms screen, rooms down and seven nights across, each guest a bar, out-of-use hatched, free cells tappable. It answers "who sleeps where", "is a room free" and "can I extend" from one view, built on `GET /guest-rooms/free` with no new rule in the browser.

## Checklist lines failed (DESIGN §9)

1 (room not on the card's first view or the Patients row) · 4 (Reason field unnamed) · 9 (New stay has no room) · 14 (s34 and s53 miss their tap targets) · 15 (Did not arrive and Remove room change things with no line before the tap; the move has no "when").

## Bugs (one line each, to become issues)

1. Moving a guest mid-stay: the Accommodation room list and type counts read nights already over, so rooms free from tonight are greyed ("T9 · Meera Iyer · Mon 19 Oct") and the move is blocked.
2. Removing a guest room with a guest in it now retires it in one tap: no sheet, no consequence line, and the guest stays in a room no longer in Names and beds.
3. Extending into a booked room says "moves them to R357330-1 for the whole stay", but the move is from today; the foot and the toast do not mention the move.
4. Did not arrive cancels every treatment in one tap with no consequence line before it, and afterwards the card keeps no record of the no-show.
5. A shared room with one bed leaving and one arriving the same day is missing from "Make up first" on the guest rooms sheet and from "Leaving … to make up" on the Guest rooms screen (A2 on 29 Oct, A1 on 28 Oct).
6. The Guest rooms screen names arrivals and leavers by first name and shows a room move as "arrives"/"leaves today": two "Vihaan arrives" on Tue 27 Oct, one a move.
7. A retired guest room is still offered (as taken) in the Accommodation room list.
8. A returning guest's Accommodation sheet preselects no room, where New patient preselects the first free one.

## Polish items (one polish-batch PR on the stay screens)

1. Room on the Patients row and the card subtitle ("Day 3 of 14 · T2 · leaves Mon 9 Nov").
2. "Arriving", not "Arrived", for a stay that has not started (New stay, Dates).
3. Toasts name the room as the card does ("Trishul House · T11"), and a move says "from tonight".
4. Guest room list: "Not chosen yet" first; taken rooms read "taken from Tue 27 Oct".
5. "Out of use for some days…" instead of "Not available…" on the guest room sheet.
6. Accessible name "Reason" on the out-of-use reason field.
7. One type order (by price) on Names and beds, the Guest rooms screen and the sheet.
8. Guest rooms sheet: name the leaver on a "Make up, then ready for…" row.
9. Shorten's consequence line says when the room frees.
10. Quick chips: "7 · 14 · 21 nights" on New patient and New stay, "+1 · +3 · +7 nights" on Dates.
11. "Is a room free?" result: price on each type header; free rooms of a type on one line.
