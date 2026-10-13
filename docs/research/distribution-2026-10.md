# Distribution plan — October 2026

One maintainer, Claude doing the work. Builds on `gtm-2026-09.md` (prices, trial, hosting) and `upsell-strategy.md` (open source, paid service). Web search on 13 Oct found little specific to wellness-centre software; the channel choices below are judgement, marked as such.

## Who buys

A residential Ayurveda centre or retreat in India, 5–10 therapists, 20–60 residents. The owner or manager decides, often on a phone, often on WhatsApp. Second ring: massage studios, spas, physio practices anywhere. Self-hosters (developers, the r/selfhosted crowd) do not buy but bring stars, bug reports and credibility.

## The funnel, and the one asset each step needs

| Step | Asset | State |
|---|---|---|
| Hears of it | A 30-second phone screen recording of "fix the day" | Missing |
| Looks | Landing page `jains.es/ruta`: one promise, three phone shots, price, FAQ | Live (#245) |
| Tries | Live demo, no sign-up | Live (#84) |
| Commits | Cloud trial on their own data | Live (#247) |
| Stays | Printed day sheet on the notice board every morning | Product |
| Tells others | "Made with Ruta" footer on the sheet, Invite a centre | Live (#249) |

Every asset already exists except the video. The gap is reach, not pages.

## Channels, in order

1. **Ten centres by hand (weeks 1–6).** List 30 residential Ayurveda centres in Kerala, Uttarakhand and Goa from Google Maps and retreat directories. WhatsApp each owner the video and the demo link, one message, no follow-up spam. Goal: three on the trial, one live (#194). Nothing else scales until one centre uses it daily.
2. **Self-hosting directories (one afternoon).** PR to awesome-selfhosted (Booking and Scheduling), alternativeto.net listing against SimplyBook and Fresha, GitHub topics (`self-hosted`, `scheduling`, `ayurveda`, `spa`). Free, permanent, no upkeep.
3. **One launch post (after channel 1 has a live centre).** "Show HN" and r/selfhosted on the same day, title naming the job ("the day sheet for a wellness centre, printed by 7 am"). One shot each; spend it with a real centre's story.
4. **Trade presence (judgement, 2027).** India International Ayurveda and Wellness Expo (Goa, January) and World Wellness Weekend (September) list hundreds of centres; use the exhibitor lists as the outreach list for channel 1 rather than buying a stand.

Not doing: paid ads, SEO blog, social accounts, Product Hunt. Each needs weekly feeding a one-person project cannot give.

## Hacks that fit one person

- The day sheet is the advert: every printed sheet carries the footer, read by every therapist and resident.
- Answer each prospect with the demo set to their kind of centre, not a call.
- One WhatsApp number for sales and support; the cloud tier's support promise is that number.
- Claude drafts every outreach message and post; the maintainer only presses send.

## What to build next (one session each)

1. Record the 30-second video from the seeded day (`scripts/` screen capture at phone size); put it top of README and landing page.
2. Directory PRs and GitHub topics (channel 2).
3. Outreach list of 30 centres as a CSV in a private place, not this repo.

## Sources

- awesome-selfhosted: https://github.com/awesome-selfhosted/awesome-selfhosted
- World Wellness Weekend India 2026: https://globalspaonline.com/wellness/india-makes-its-mark-on-the-world-wellness-weekend
- Ayurveda and Wellness Expo, Goa: https://www.thegoan.net/goa-news/ayurveda-and-wellness-expo-to-be-held-in-goa-from-january-23/142220.html
