# No Android app; alerts through the home-screen web app, after launch

27 Oct 2026, #1329 (plan), #1328 (pausing treatments, later). Decided by the maintainer.

No native app. Nobody has asked for one, only the admin would use it, and a solo maintainer cannot keep a second codebase and a Play Store listing going. The app becomes installable on the home screen, and alerts arrive as web push notifications through it. There is no WhatsApp, because it would add an account, per-message cost and a Meta dependency.

Alerts are built to avoid alarm fatigue, which hospitals learned the hard way. Each alert has one owner, one action and a time after which it comes back to the admin, and it stays on a "Needs you" list until closed. Only six kinds may buzz at once: a vitals concern, a staff no-show, a room complaint, an unhappy guest still in house, a patient no-show the therapist could not resolve, and a Form C close to its 24-hour deadline. A seventh needs its own decision file. Everything else goes into a digest at 13:00 and 18:00, or into a weekly check on Thursday at 18:00. Nothing buzzes outside the centre's hours. A notification only says "look now": the day sheet and the app stay the record.

Two additions follow from this. A support staff role (housekeeping, maintenance, events, yoga) gets a link showing "Things to check", so the admin can hand a problem on with one tap. Each therapy gets an optional check-in after a set time (vamana, virechana, basti), which the doctor, therapist, support staff or the patient answers with Fine or Concern.

Clinical defaults come from published practice, and a centre can change them: NEWS2 bands for vitals, 48 minutes for niruha basti, 3, 5 or 7 days of samsarjana krama. The full list is in #1329.

Left out: the native app, WhatsApp, a deputy for the admin's day off, an alert for treatments that end early, and a kitchen link. Pausing treatments is #1328.
