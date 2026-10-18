# Every merge to main updates the host: a tested copy first, then demo, babaji, every trial

18 Oct 2026, #904, decided by the maintainer.

The sign-up service on the Mac checks main every ten minutes. A new commit is first tested on a throwaway centre (`npm run qa` on a fresh seed, then removed), then rolled out to the demo, then ruta-babaji, then every running trial, each with `hosting/centre.sh up` on its own port. A failure stops the rollout where it happened and is told on Telegram and in the 7 o'clock morning message; the same commit is not tried again. Babaji counts as live. A centre with data is never reseeded: `up` keeps the volume and the app seeds only an empty database. Left out: a screenshot of the demo after each update (the host has no browser installed), and paused trials, which take the new version when switched back on and rebuilt.
