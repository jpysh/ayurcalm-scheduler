# Run AyurCalm on your own Mac

Free, on a Mac (or mini PC) that stays on at the centre. You get your own web address with HTTPS through a Cloudflare Tunnel: nothing opened on the router, no fixed IP needed. About an hour the first time.

**You need:** a Mac that stays on, a Cloudflare account (free), and a domain in that account (about ₹800 a year, or one you already have).

## 1. The app

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/). In its Settings → General, tick **Start Docker Desktop when you sign in**.
2. Stop the Mac sleeping: System Settings → Energy (or Battery → Options) → **Prevent automatic sleeping when the display is off**, and **Start up automatically after a power failure**. Set the Mac to sign in automatically (Users & Groups).
3. In Terminal:

   ```bash
   git clone https://github.com/jpysh/ayurcalm-scheduler.git ~/ayurcalm
   cd ~/ayurcalm
   cp .env.example .env
   ```

4. Edit `.env`: set a long `POSTGRES_PASSWORD` (`openssl rand -base64 24` makes one) and add a line `BEHIND_CLOUDFLARE=true`. Then:

   ```bash
   docker compose up -d
   ```

5. Open http://localhost:8080, sign in with `admin@example.com` / `demo1234`, and **change that password** (Settings → People with access) before step 2. The setup wizard then clears the demo and asks for the centre's details.

Docker restarts the app by itself after a reboot or a crash.

## 2. Your web address (named Cloudflare Tunnel)

Replace `app.yourcentre.in` with the address you want.

```bash
brew install cloudflared
cloudflared tunnel login
```

A browser opens: pick your domain, click **Authorize**. Then:

```bash
cloudflared tunnel create ayurcalm
cloudflared tunnel route dns ayurcalm app.yourcentre.in
```

Create `~/.cloudflared/config.yml` (the `create` command printed the file name for `credentials-file`):

```yaml
tunnel: ayurcalm
credentials-file: /Users/YOU/.cloudflared/TUNNEL-ID.json
ingress:
  - hostname: app.yourcentre.in
    service: http://localhost:8080
  - service: http_status:404
```

Start it now and at every sign-in:

```bash
cloudflared service install
```

Open https://app.yourcentre.in on your phone. The first minute after starting can show a 404; wait and reload.

## 3. Backups

Already running: every night at 02:30 India time the whole database (logos and signatures included) is saved to `~/ayurcalm/backups`, newest 14 kept. Settings → Backups shows the last one.

**Keep a copy off the Mac.** A backup on the same disk dies with the disk. Once a week, Settings → Backups → *Download the newest backup* on your phone. Time Machine on the Mac also copies the `backups` folder.

**Restore** (in `~/ayurcalm`):

```bash
docker compose stop app
gunzip -c backups/ayurcalm-YYYYMMDD-HHMM.sql.gz | docker compose exec -T db psql -q -U ayurcalm ayurcalm && docker compose start app
```

**Is it all still working?** `scripts/daily-check.sh https://your-address/` prints one line each for the address, every backup (older than 26 hours is a problem), stopped containers and disk, and exits 1 if anything is wrong. Run it from a morning scheduled task.

**Moving to or from the cloud:** Settings → Backups → *Download everything* gives one file; *Load a centre from a file* on a new install loads it.

## 4. Updates

```bash
cd ~/ayurcalm && git pull && docker compose up -d --build
```

Your data stays; take a backup download first.

## If something goes wrong

| What you see | Do this |
|---|---|
| The address shows a Cloudflare error page | The Mac is off or asleep, or Docker is not running. Open Docker Desktop. |
| 404 at your address | `cloudflared` started before the app; wait a minute. If it stays, check `hostname` in `config.yml`. |
| Locked out | `docker compose exec app npx tsx server/src/scripts/resetPassword.ts you@example.com` |

## Configuration

Install-time settings in `.env` (copy `.env.example`). The defaults work for a local trial. Everything else (centre details, opening hours, timezone, support contacts, people with access) is set in the app under **Settings**; a setup wizard asks for the essentials on first sign-in.

| Variable | Default | Purpose |
|---|---|---|
| `APP_PORT` | `8080` | Host port the app is served on |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `ayurcalm` | Database credentials |
| `JWT_SECRET` | *(random per restart)* | Session signing secret. Set it (`openssl rand -base64 32`) so sessions survive restarts |
| `CENTRE_NAME` | `Wellness Centre` | Centre name used on first run only; after that it is edited in **Settings** |
| `DEFAULT_SUPPORT_WHATSAPP` | maintainer's number | Support contact seeded on first run; changed in **Settings** afterwards |
| `DEMO_MODE` | off | `true` runs the public demo: sign-in shown on screen, data put back every 6 hours (00, 06, 12, 18 UTC), hidden from search, and users, passwords, import and clearing the demo are turned off |

When you are ready to replace the example centre with your own, use **Settings → Clear demo data**.

## Security

Passwords are bcrypt hashes in Postgres, sessions are JWTs, and every API route except `/api/health`, `/api/auth/login` and `/api/public/support` needs a valid token. The public route returns only the centre's name and the patient contact number.

This is a small project maintained by one person and has not had an external security audit. Put it behind HTTPS (the tunnel above does this) and keep backups off the machine. Report vulnerabilities as described in [SECURITY.md](../SECURITY.md).
