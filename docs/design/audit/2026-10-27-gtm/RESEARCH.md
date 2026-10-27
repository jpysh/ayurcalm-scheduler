# Self-serve adoption research, 27 Oct 2026

The question: how can a centre sign up, set itself up and come to depend on Ruta within 30 days with nobody's help, so the maintainer is contacted only about bugs and feature requests? This is research only, with no code changes. Web results came from search summaries. [V] = the vendor's own page, [S] = a secondary summary or blog (directional only).

## 1. Already concluded (do not redo)

| Topic | Conclusion | Where |
|---|---|---|
| Scope | No self-booking, payments, marketplace, marketing/loyalty, multi-location, payroll or GST. Reminders rarely needed for residents. Self-host and data ownership are the trust answer | #53 §2, §5 |
| Price | ₹999/month per centre (₹9,990/year), incl. GST, flat and not per seat. No founding offer. Rupees shown to everyone | `site/public/ruta/index.html`, `decisions/2026-10-13-landing-rupees-no-founding.md` (supersedes ₹2,999 in #231 and ₹1,499 in `gtm-2026-09.md`) |
| Trial | 30 days with no card, opt-in. The clock starts at the first guest or the first printed sheet. At the end the centre goes read-only for 60 days, and export keeps working | #247, #231, landing FAQ |
| Trial length evidence | Use 30 days, because the value shows only after 1–2 weeks of real stays | `docs/research/gtm-2026-09.md` §2 (removed in #886; read with `git show 1e27c213:docs/research/gtm-2026-09.md`) |
| First session | Sign-up goes straight in. The centre opens on an example day under its own name. Make it mine takes three steps. No tours, no pricing in the first session | `decisions/2026-10-13-fastest-start.md`, #727–#729 |
| Empty start | Get started fills the screen until the centre can book, then stays as one row until the first treatment | `decisions/2026-10-19-get-started-is-the-screen-until-ready.md` |
| Measuring | Each trial records two times: when it reached the example and when it printed its first sheet. A morning Telegram message reports sign-ups, sheets printed, silent trials and feedback | #730, `decisions/2026-10-14-morning-dashboard.md` |
| Growth loops | "Made with Ruta" footer on sheets and links (paying centres can turn it off). Invite a centre gives both sides 3 free months. Doctor links come later. AMAI and Kerala cluster outreach is the maintainer's job | #249, `SettingsMore.tsx:186,199` |
| Licence | AGPL-3.0, complete code. Setup, support and hosting are what is sold | `decisions/2026-10-22-agpl-licence.md` |
| Sign-up page | One screen with two fields, invisible Turnstile, "30 days free · no card", the link sent by email too, the demo with no login | `audit/2026-10-27-public-access/PLAN.md` |
| Market gap | Nobody else handles residential stays, one-pass replanning or a printed per-person sheet. Jane prints day sheets on desktop only | `audit/2026-10-18/benchmarks.md` |

Not found anywhere: trial lifecycle messages (`provisioner/lifecycle.mjs` only pauses and deletes, and no "7 days left" email exists in code), an activation definition beyond "first sheet", or help docs for admins.

## 2. External findings

**Time to value and activation**
- Median time to value is about 1.5 days across 547 SaaS products, and healthcare runs 1–2 days. Average activation is 37.5%, checklist completion 19.2% and one-month retention 46.9%. Setup steps do not count as value [S, single vendor] userpilot.com/blog/time-to-value.
- In those numbers, a checklist is finished by fewer than 1 in 5 users. A checklist is not the activation event; a real outcome is.

**Sample data vs blank start**
- No controlled study was found. Sample content appears in about 100 of 809 apps, and a plain empty state in 46% [S] lazyweb.com/research. Guides advise offering sample data next to a single primary action. This matches the fastest-start decision, which keeps the example day with one link.

**Trials and conversion**
- Trials convert at 2–3× freemium. Classic trials convert 8–25%, reverse trials 7–21%, freemium 3–15% [S] growthunhinged.com/p/your-guide-to-reverse-trials, techcrunch.com/2022/11/12/freemium-or-free-trials-why-not-both.
- Cliniko: 30 days, no card, every feature, data carries over, and subscribing means adding a card [V] cliniko.com/pricing, help.cliniko.com/en/articles/984724. SimplePractice: 30 days with no card, and a step-by-step setup [S] Capterra reviews.
- Jane: no self-serve trial. A demo clinic, a free 45-minute setup call, free import, and "about 2 weeks to get running" [V] jane.app/start, jane.app/demo. The high-touch rivals spend people where Ruta must spend product.

**Lifecycle nudges**
- Messages triggered by what the user does beat a fixed day-by-day schedule. A day-3 "try X" message insults anyone who already did X. Use time only as the fallback for people who do nothing [S] posthog.com/blog/your-lifecycle-emails-are-wrong.

**Open source as trust and distribution**
- Plausible: AGPL, self-hosted edition identical to the cloud product, bootstrapped on cloud subscriptions, no advertising, grown through content and community [V] plausible.io/docs/self-hosting, [S] riseofcommunity.substack.com/p/how-plausible-bootstrapped-to-500k.
- Chatwoot: Docker is a main install path, 1M image pulls in a month and about 40k self-hosted installs, with a cloud product alongside [V] chatwoot.com/blog/chatwoot-august-update, chatwoot.com/careers. Self-hosters spread the name. The revenue comes from people who do not want to run servers.

**India SMB buying**
- Trust and fast replies count more than features. Founders answer on the same WhatsApp number. Buyers were let down by vendors after past sales [S] echai.ventures, trackobit.com/blog/why-indian-companies-take-time-to-buy-software. Rupee prices and WhatsApp are expected [S] mewayz.com. No independent figures. Of 3,000+ G2 India respondents, mostly larger firms, ease of implementation ranks near the top [V] research.g2.com/india-buyer-behavior-study.
- Indian Ayurveda tools (VaidyaManager, SoftAyu, AyurGrid, DoctorsApp) sell by demo or quote. Few publish prices or offer self-serve trials [S] softwaresuggest.com/vaidyamanager, techjockey.com/detail/softayu, ayurgrid.com.

**AI help bots**
- Intercom Fin averages 51–56% resolution, and a new deployment should expect 30–50%. The result depends mostly on how well the help articles are written. "Resolved" includes customers who simply stop replying [V] aws.amazon.com/solutions/case-studies/intercom-anthropic, community.intercom.com. Docs come first, and a bot is only as good as they are.

## 3. Ruta's first 30 days as they are today

| Day | What the centre does | Stall risk |
|---|---|---|
| 0 | Landing, sign-up (2 fields), wait about 2 min, set password, example day | **High.** The 2-minute wait keeps the page open, and the link is not sent by email (#1270). Brand is missing on sign-up |
| 0 | Explores the example, taps Make it mine: therapists, rooms and therapies, tomorrow's residents, plan | **High.** Typing a whole centre's lists on a phone. Steps can be left for later |
| 1 | First real day sheet printed. Trial clock starts | **Medium.** It needs a printer and the habit of printing |
| 1–7 | Adds arrivals, books courses, shares therapist links on WhatsApp, fixes a leave day | **High.** No message brings back an admin who went quiet. Nobody knows they stopped except the morning report |
| 7–21 | Prints daily, shares links | Low once printing is a habit. The sheet replaces the whiteboard |
| 23 | Nothing in the app says the end is coming (in code) | **High.** No reminder |
| 30 | Read-only, Choose a plan | **Medium.** Payment is manual. They have to reach the maintainer to pay |

## 4. What this means for Ruta
1. The activation event is a real-data day sheet printed or shared on three different days in the first week. One print is curiosity; three is a habit.
2. Remaining effort belongs after the first session: bringing back silent trials, a habit check-in, the end of the trial, and paying without a conversation.
3. A help bot comes after written help, never before.
