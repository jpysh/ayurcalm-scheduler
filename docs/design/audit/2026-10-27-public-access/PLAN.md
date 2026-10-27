# Public access audit, 27 Oct 2026 (#1270)

Screenshots here (375px, 1366px). All load under 0.6 s; no sideways scroll; inputs labelled.

## Scores
- **jains.es/ruta 7/10.** Clear name, price, no card; "residential" never said.
- **signup.jains.es 5/10.** 2 fields, but no Ruta name, other fonts, no way back.
- **demo.jains.es 5/10.** Opens on a login for a made-up centre; no Ruta brand, no "Start free".

## Findings
High
1. Sign-up and demo do not say Ruta.
2. The centre's address is `yourname.jains.es`: the app reads as jains.es.
3. Landing footer says the code is "open source (MIT)"; the repo is AGPL-3.0.
4. Support address `helloayursen@gmail.com` (Gmail, third name) weakens trust.

Medium
5. Demo needs a tap on "Open the demo" past a login screen
6. No link from sign-up or demo back to the landing, none from the demo to sign-up.
7. WhatsApp number is +420 (Czech) for India: maintainer's call.
8. Footer links are under 24px tall.
9. Repo and links still say `ayurcalm`.

## Today's flow
1. Landing: tap Start free (1).
2. Sign-up: type centre, type email, tick Turnstile (sometimes), Create (3).
3. Wait about 2 min, keep the page open; tap Open your centre (1).
4. Choose password, Continue (1). Lands on an example day; Make it mine later.

6 taps, 3 fields, 2-min wait: near best practice; gaps are brand and the wait.

## What good looks like (sources)
- Cliniko: 5 inputs on one screen, no card, 30 days, time zone detected (cliniko.com/free-trial).
- Calendly: email or Google/Microsoft, no card (calendly.com/signup).
- Fewer fields beat fewer steps; defer account details until there is value (baymard.com/blog/checkout-flow-average-form-fields).
- Show only what most need, defer the rest, two levels at most.

## Recommended sign-up (one screen, phone)
- Header: Ruta logo + "Scheduling for residential wellness and Ayurveda centres".
- Centre name, then email. Nothing else.
- Turnstile invisible/managed mode, no checkbox for most.
- Button "Create my centre". Under it: "30 days free · no card · your data stays yours".
- Secondary: "Look first: open the demo" (no login).
- Waiting screen: email the link too, so closing the page loses nothing.
- In app: password, then centre's example day (as today). Hours and time zone move to Make it mine.

## Where sign-up and demo live (maintainer decides)
- **Keep jains.es** (`signup.`, `demo.`, `x.jains.es`): no work; Ruta never in an address.
- **Ruta subdomain** (`ruta.jains.es`, `signup.ruta.jains.es`, `demo.ruta…`, centres `x.ruta.jains.es`): says Ruta; two-level wildcard certificate is paid.
- **Own domain** (e.g. a ruta domain): clearest; purchase, email setup, name may be taken.

## What changes where
- `site/`: AGPL in footer, back-links (website session).
- `provisioner/public.mjs`: logo, strapline, fonts, invisible Turnstile, email the link.
- `src/pages/Login.tsx` (demo): open straight on the day, add "Start free".
- DNS/`RUTA_DOMAIN`: only after the domain decision.
