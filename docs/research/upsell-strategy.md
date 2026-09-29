# Upsell strategy: open source, paid service

Decided 29 Sept 2026. Pricing numbers live in #245; this page is the reasoning.

## The model

The whole app is MIT and stays complete. Nothing is removed from self-hosters, now or later. Centres pay for the **service around the app**, not for features:

| | Self-host (free) | Cloud + support (paid) |
|---|---|---|
| Every feature, including templates | Yes | Yes |
| Hosting, HTTPS, nightly backups, updates | You do it | We do it |
| Hosted MCP connector | Run your own | Included |
| Support: WhatsApp, email, phone (working hours IST) | Community only | Included |
| Setup help: we fill in your therapies, rooms, programmes and rota from your paper sheets | No | Included |

On-premise + support (#245) is the same support package for a centre that keeps the app on its own machine.

## Trial and upgrade

- 30-day cloud trial, full app, no card. Support and setup help are **not** part of the trial; a centre that wants them upgrades early, any day of the trial.
- At trial end nothing is deleted: the centre goes read-only with export for 60 days (#231). That is the upgrade trigger, not a missing feature.
- One paid plan until 10 paying centres. A second tier before then is guessing.

## Why this shape (research, one round)

- **Plausible** keeps a few labour-saving features cloud-only and says openly it funds development; reliability (backups, updates, bot filtering) is the bigger sell.
- **Invoice Ninja** gives self-hosters every feature and charges about $40/year for white-label; revenue comes from hosting.
- **Easy!Appointments**, the closest match, is fully free and sells installation, upgrades and support contracts.
- **Cal.com, GitLab, Odoo** gate features by buyer (teams, SSO, compliance). That fits companies with IT buyers, not a single-centre admin.
- **Mattermost** (removed formerly free features) and **n8n** (per-run fees on self-hosted) drew bait-and-switch backlash. Lesson: never meter a user's own freedom.

Our buyer is a non-technical centre that will rarely self-host, so self-hosting costs little revenue and earns trust ("you can always leave with your data").

## Risks and answers

| Risk | Answer |
|---|---|
| Someone forks and resells it | Allowed under MIT. They cannot copy the support, setup help or the name. |
| A self-hosting centre expects free support | Point to On-premise + support. Community help only otherwise. |
| Support eats the maintainer's day | Working hours IST, same-day reply, no 24/7. Written on the site. |
| Setup help becomes unpaid consulting | Only for paying centres; one setup per centre, changes after that are normal support. |
| Trial users see an empty app and leave | Templates are free and in the app; the demo (demo.jains.es) shows a full centre first. |
| Undercut by a cheaper rival | Self-host is ₹0; cloud at ₹999 founding is far below Jane, Mindbody and Vagaro (see gtm-2026-09.md). |

## Sources

- https://plausible.io/self-hosted-web-analytics
- https://cal.com/pricing
- https://invoiceninja.com/pricing-plans/
- https://forum.invoiceninja.com/t/white-label-licence/12737
- https://easyappointments.org/premium/
- https://cloudpepper.io/blog/odoo-community-vs-enterprise-choosing-the-right-edition-for-your-business/
- https://forum.mattermost.com/t/a-critical-response-to-mattermost-s-recent-changes/25407
- https://psbigbig.medium.com/open-source-vs-open-core-what-the-n8n-pricing-debate-taught-me-and-why-my-project-cant-even-8c6273f21adb
