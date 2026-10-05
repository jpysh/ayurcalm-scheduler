# The #252 walk on a local trial stack, 5 Oct (375×812)

Why local: nobody had ticked the Cloudflare box at signup.jains.es (#252, #267), so a brand-new trial centre was made through a scratch provisioner (:8202) and walked there. The live walk differs only in the sign-up page itself.

| Step | Result | Found |
|---|---|---|
| Sign-up, "Open your centre", password, name, hours (wizard) | pass | |
| Therapies from the library (tick, add) | pass | |
| Rooms | pass | rooms start with every fitting ticked; fine, but easy to leave wrong |
| Therapists and a doctor | pass | |
| Patients with stays | pass | consultation never pre-booked (fixed) |
| A course of treatments | FIXED | course landed at 16:00 while the sheet and toast said 15:45 |
| Today's day sheet, therapist rota, doctor rota (PDF) | pass | |
| Therapist away, replan | FIXED | moved a session onto a day that already had that therapy: "Abhyanga, Abhyanga" |
| No-show, cancellation | pass | |
| Doctor consultation | FIXED | library Consultation needed fittings no room had; "book one" opened on Abhyanga |
| Three private links (therapist, doctor, resident) | pass | |
| Discharge summary | pass | draft says "Stable. All vitals stable" before any vitals exist: the doctor edits and signs it |
| Export, import onto a fresh install | pass | same day sheet on both |
| Trial states (5, 26, 29, 31 days in) | pass | |
| Team "This week" | FIXED | 0h booked of 0h for a team whose hours were never set |
| Therapist picker, two-therapist therapy | FIXED | the second therapist was refused with "needs 2 therapists and has 1" |
| Booking, 40 therapies | FIXED | the wheel is now a search past 12 therapies |

Not fixed: a treatment's History shows the phone's clock, not the centre's. Only matters when the two differ.
