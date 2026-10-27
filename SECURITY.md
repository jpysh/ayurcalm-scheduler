# Security

## How your centre's data is kept safe

- **Your data stays with you.** One centre per install, on your own machine or your own cloud trial. Nothing is shared with other centres; the app sends nothing out except an update check and the problem reports you choose to send.
- **Every page needs a sign-in**, except the private links you send to a therapist, doctor or guest. Each link shows only that person's own day, and you can renew it to stop the old one.
- **Passwords** are stored only as bcrypt hashes. The demo password `demo1234` cannot save anything until it is changed.
- **Wrong passwords are limited**: ten per address and thirty per account in 15 minutes.
- **Admin and staff roles.** Staff cannot change settings, users, backups or the AI key.
- **Nightly backups** on your own machine, downloadable from Settings.
- **Checked on every change and every week**: automated tests, GitHub code scanning (CodeQL), secret scanning, Dependabot security updates, the [OpenSSF Best Practices badge](https://www.bestpractices.dev/projects/15691) (passing), and the [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/jpysh/ruta).
- **Open source (MIT)**: anyone can read exactly what the code does.

Put a self-hosted install behind HTTPS (the Cloudflare Tunnel in the [self-host guide](docs/self-host.md) does this) and keep a backup off the machine.

## Reporting a vulnerability

Please do not open a public issue. Use [private vulnerability reporting](https://github.com/jpysh/ruta/security/advisories/new); it stays private until a fix is released. Expect a reply within a week.

## Supported versions

Fixes land on `main` and in the next release. There are no long-term support branches.
