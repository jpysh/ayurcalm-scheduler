# Self-serve to paid in 30 days: the plan (27 Oct 2026)

Sources and day-by-day map: `RESEARCH.md`.

## Activation event
**A real-data day sheet printed or shared on 3 different days within the first 7 days of the clock.** Add it to the morning report (#730 already records the first sheet).

## Day 0–30
- **Day 0:** example day, Make it mine, tomorrow planned. Goal: first sheet within 24 hours.
- **Day 1–3:** print each morning, send therapist links on WhatsApp. If there is no sheet by day 2, send one email: "Tomorrow's sheet in 3 steps", with a link straight into Make it mine.
- **Day 4–7:** a real disruption (leave, a late arrival) gets fixed in one tap. That proves the value.
- **Day 8–21:** the habit is set. Silent for 3 days → one email.
- **Day 23:** in-app banner and email: "7 days left. Pay ₹999 to keep going." Data is never at risk.
- **Day 30:** read-only. Pay in the app. No WhatsApp needed.

## Product changes, ranked (impact ÷ effort)
1. **Email the centre's link at sign-up** so closing the page loses nothing (S, already in #1270).
2. **Behaviour-triggered emails:** no sheet by day 2, silent for 3 days, 7 days left. Three messages, nothing more (S–M, `provisioner/lifecycle.mjs`).
3. **Pay without the maintainer:** a UPI/payment link from "Choose a plan" that unlocks the centre when paid, with the receipt done by hand at first (M).
4. **Paste a list in Make it mine** for therapists, therapies and residents, copied from WhatsApp or Excel. Typing on a phone is where the first session stalls (M).
5. **A streak line on the morning screen:** "Printed 5 mornings in a row" (S).
6. **Home-screen shortcut prompt** after the first sheet (S, benchmarks steal #7).
7. **A one-page help article per story** (s1–s10), linked from each screen's refusals and empty states. A future help bot reads these (M; bot later, only once there are 20+ articles).
8. **Activation and silent-trial lines** in the morning report (S).

## Landing and sign-up should say
- "Ruta: scheduling for residential wellness centres, including Ayurveda, spas and retreats."
- One promise: **"Tomorrow's day sheet in 10 minutes, from your phone."**
- "30 days free · no card · ₹999 a month after · your data is yours, and the code is open (AGPL)."
- Look before signing up: a demo with no login. Proof: the printed A4.
- WhatsApp is for bugs and ideas, not setup. "You won't need us to start."

## Leave out
- Self-booking, payments, marketplace, marketing and loyalty, multi-location, payroll and GST (#53).
- Product tours, a separate onboarding checklist, gamification beyond the streak line.
- Patient SMS or WhatsApp reminders: residents are on site.
- An AI help bot before written help exists. Free setup calls by default. Card at sign-up. A freemium tier (trials convert 2–3× better).
- Spa or physio example days until one of those centres signs up.

## Maintainer's call
- Payment rail (UPI link, Razorpay, or by hand). Needed before item 3.
