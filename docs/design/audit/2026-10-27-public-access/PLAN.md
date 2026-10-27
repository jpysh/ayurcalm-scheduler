# Public access audit, 27 Oct 2026 (#1270)

Screenshots here, 375px and 1366px, taken live. All three pages load in under 0.6 s, no sideways scroll, every input labelled, no images without alt.

## Scores
- **jains.es/ruta 7/10.** Clear: "Ruta", one phone, Ayurveda/spa/physio, price, no card. Weak: residential stays never named in the hero.
- **signup.jains.es 5/10.** Short form (2 fields), but no Ruta name or logo, different font and colours from the landing, no way back.
- **demo.jains.es 5/10.** Opens on a login for a made-up centre; tab title "Ruta - Ayurvedic Therapy Centre Management"; no Ruta brand, no "Start free".

## Findings
High
1. Sign-up and demo do not say Ruta. A visitor from an ad or WhatsApp link cannot tell what product this is.
2. The centre's address is `yourname.jains.es`, so a customer's own app reads as jains.es, not Ruta.
3. Landing footer says the code is "open source (MIT)"; the repo is AGPL-3.0.
4. Support address `helloayursen@gmail.com`: a Gmail with a third name weakens trust at the moment of sign-up.

Medium
5. Demo needs a tap on "Open the demo" past a login screen; it should open on the day.
6. No link from sign-up or demo back to the landing, none from the demo to sign-up.
7. WhatsApp number is +420 (Czech) for a rupee-priced, India-first offer: the maintainer's call.
8. Footer links are under 24px tall (WCAG 2.2 target size).
9. Repo and links still say `ayurcalm`.

## Today's flow (code: `site/public/ruta/index.html`, `provisioner/public.mjs`, `src/pages/SetupWizard.tsx`)
1. Landing: tap Start free (1).
2. Sign-up: type centre, type email, tick Turnstile (sometimes), Create (3).
3. Wait about 2 min, keep the page open; tap Open your centre (1). The link works once, 30 min.
4. Choose password, Continue (1). Lands on an example day; Make it mine later.

About 6 taps, 3 fields, a 2-minute wait. Already close to best practice; the gaps are brand and the wait.

## What good looks like (sources)
- Cliniko: 5 inputs on one screen, no card, 30 days, time zone detected ([cliniko.com/free-trial](https://www.cliniko.com/free-trial)).
- Calendly: email or Google/Microsoft, no card ([calendly.com/signup](https://calendly.com/signup)).
- Mindbody, Jane: demo-first, sales-led. SimplePractice/Fresha: trust counts and security badges by the CTA.
- Fewer fields beat fewer steps; defer account details until there is value ([Baymard](https://baymard.com/blog/checkout-flow-average-form-fields)).
- Show only what most need, defer the rest, two levels at most ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/)).
- Magic links: no strong evidence either way; email delay is the known risk. Keep password set in-app.

## Recommended sign-up (one screen, phone)
- Header: Ruta logo + "Scheduling for residential wellness and Ayurveda centres".
- Field 1 Centre name (`organization`). Field 2 Email (`email`). Nothing else.
- Turnstile invisible/managed mode, no checkbox for most.
- Button "Create my centre". Under it: "30 days free · no card · your data stays yours" + link to pilot notice.
- Secondary: "Look first: open the demo" (no login).
- Waiting screen: show the demo day in the meantime or a 3-step "what happens next"; email the link too, so closing the page loses nothing.
- In app: password, then centre's example day (as today). Hours and time zone move to Make it mine.
Later, not now: Google sign-in (needs OAuth and per-centre accounts).

## Where sign-up and demo live (maintainer decides)
- **Keep jains.es** (`signup.`, `demo.`, `x.jains.es`): no cost or work; Ruta never appears in an address.
- **Ruta subdomain** (`ruta.jains.es`, `signup.ruta.jains.es`, `demo.ruta…`, centres `x.ruta.jains.es`): says Ruta, same domain and Cloudflare account; needs wildcard certs two levels deep (Advanced Certificate, paid) and `RUTA_DOMAIN` change.
- **Own domain** (e.g. a ruta domain): clearest brand, one-line customer URLs; a purchase, new zone, email setup, and the name may be taken.

## What changes where
- `site/`: footer licence (AGPL), back-links, consistent brand (website session).
- `provisioner/public.mjs`: logo, strapline, fonts, invisible Turnstile, email the link.
- `src/pages/Login.tsx` (demo): open straight on the day, add "Start free".
- DNS/`RUTA_DOMAIN`: only after the domain decision.
