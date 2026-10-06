# #351 part 3 — seeded shifts

Lite seed, 375×812, 6 Oct. Before: every seeded person 09:00–20:00 every day (see [../2026-10-06-team-gaps/before-team.png](../2026-10-06-team-gaps/before-team.png)).

| Check | After | Result |
|---|---|---|
| Team today | Kumar and Priya 07:00–15:00, Neha and Raj 13:00–20:00, Anjali and Ravi 09:00–18:00, Dr Lakshmi Menon 08:00–14:00; Ravi struck through, Personal Leave ([shot](after-team-today.png)) | pass |
| Wed 7 Oct | Anjali "Day off" ([shot](after-team-wed.png)); the rota prints her under "Not available today — Day off" | pass |
| Fri 9 Oct | Neha on leave, so "Too few therapists in · 18:00–20:00 · only 1 in" ([shot](after-team-fri.png)) | pass |
| Today's problems kept | Ravi off with 4 treatments still on his name (09:00, 09:30, 10:30, 11:30); Sai Singh kept to their own therapist | pass |
| Therapist rota | each name now prints its hours over the booked time ("07:00–15:00 / 3h 30m"); yoga and prayer sit with the early shift in the morning and the afternoon shift in the evening ([before](before-therapist-rota.txt), [after](after-therapist-rota.txt)) | pass |
| Doctor rota | "08:00–14:00 / 40m" under the doctor ([before](before-doctor-rota.txt), [after](after-doctor-rota.txt)) | pass |
| qa `scheduleInvariants` | new line: every treatment is inside its therapists' weekly hours | pass |
