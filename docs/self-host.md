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
