# Deploy Vidhyalayam ERP on Hostinger VPS — Beginner's Guide

This guide deploys the Vidhyalayam school ERP (Next.js 16 + Prisma/PostgreSQL, optional Redis workers) to a Hostinger VPS.

**What you'll end up with:** Ubuntu VPS running your app on port 3000, Nginx serving it at `https://erp.yourdomain.com`, PostgreSQL database, all managed with PM2.

---

## Part 0 — Things to know about YOUR project

- Repo: `https://github.com/i-manish-3/my-digital-acadmey-v1.0.git`
- Needs **Node 20.9+** (use Node 22 LTS) and **PostgreSQL** (any recent version)
- **Redis is optional** — without it, demand slips, notifications and exports run instantly inside the request (slower but works). Add Redis later if you want background jobs.
- Login after seeding: **`admin@dpsdelhi.in` / `admin123`** (school admin), **`sahyog.vidhyalayam@gmail.com` / `admin123`** (super admin) — change these immediately after deploy
- Auth cookies are `Secure` in production → **HTTPS is mandatory** (Part 9 sets it up)
- Files (photos, logos) are stored on the VPS in `public/uploads/` by default

---

## Part 1 — Buy the VPS (Hostinger)

1. Hostinger → VPS → choose **KVM 2 (or KVM 4 if budget allows)** → OS: **Ubuntu 22.04** → datacenter nearest you
2. Set a **strong root password** (save it in a notes app!)
3. Order it, wait ~5 min for provisioning

**Your domain:** Hostinger panel → Domains → add your domain → DNS → add an **A record**: name `erp` (if you want `erp.yourdomain.com`) → value = your VPS IP → TTL 3600. (The IP is on your VPS dashboard.)

---

## Part 2 — Connect to the server (from Windows)

1. Install **PuTTY** (or use Windows Terminal — both work)
2. Open PuTTY → Host: `root@<your-vps-ip>` → Port 22 → Open
3. Accept the fingerprint, enter the root password (right-click = paste in PuTTY)

You should now see a black terminal like `root@host:~#`. From here on, everything happens in this terminal.

---

## Part 3 — One-time server setup

Copy-paste each block, one at a time:

```bash
apt update && apt upgrade -y
```

```bash
# Swap (prevents the build crashing on low-RAM VPSes)
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

```bash
# Install basics
apt install -y git curl build-essential nginx postgresql postgresql-contrib
```

```bash
# Node 22 LTS (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm alias default 22
node -v    # should print v22.x.x
```

```bash
# Bun (your seed scripts use `bun run`)
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

```bash
# PM2 (keeps the app alive, restarts on crash/boot)
npm install -g pm2
```

---

## Part 4 — Create the database

```bash
sudo -u postgres psql
```

Then inside the `psql` prompt, paste (replace `STRONG_DB_PASSWORD` with something long & random):

```sql
CREATE USER vidhya WITH PASSWORD 'STRONG_DB_PASSWORD';
CREATE DATABASE vidhyalayam OWNER vidhya;
\q
```

Test the connection string (any output = success):

```bash
PGPASSWORD='STRONG_DB_PASSWORD' psql -h 127.0.0.1 -U vidhya -d vidhyalayam -c 'SELECT 1;'
```

---

## Part 5 — Put the code on the server

```bash
cd /var/www
git clone https://github.com/i-manish-3/my-digital-acadmey-v1.0.git
cd my-digital-acadmey-v1.0
```

---

## Part 6 — Create the `.env` file

```bash
nano .env
```

Paste this (edit the values in ALL CAPS):

```env
DATABASE_URL=postgresql://vidhya:STRONG_DB_PASSWORD@127.0.0.1:5432/vidhyalayam?connection_limit=10

JWT_SECRET=CHANGE_ME_RANDOM
TOKEN_ENCRYPTION_KEY=CHANGE_ME_RANDOM
PUBLIC_APP_URL=https://erp.yourdomain.com

STORAGE_DRIVER=local
```

**Generate the two random values** (run outside nano, then paste the outputs):

```bash
openssl rand -hex 32
openssl rand -hex 32
```

- First output → `JWT_SECRET`
- Second output → `TOKEN_ENCRYPTION_KEY` (32 bytes = 64 hex chars, exactly what it expects)

Leave out SMTP / OpenRouter / R2 / Redis vars for now — all optional. Save with `Ctrl+O`, Enter, `Ctrl+X`.

---

## Part 7 — Install dependencies & set up the database

```bash
cd /var/www/my-digital-acadmey-v1.0
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
```

- `npm install` — installs everything (first run takes a few minutes)
- `prisma generate` — creates the DB client (skip this and the build fails — there's no postinstall hook in this project)
- `migrate deploy` — applies your existing migration files (your repo has `prisma/migrations`)
- `npm run seed` — creates the admin logins + demo school

Verify data exists:

```bash
PGPASSWORD='STRONG_DB_PASSWORD' psql -h 127.0.0.1 -U vidhya -d vidhyalayam -c 'SELECT email, role FROM "User";'
```

---

## Part 8 — Build & run with PM2

```bash
npm run build
```

First build takes 2–5 minutes (your config has `ignoreBuildErrors: true`, so minor TS warnings won't stop it). If it dies with "out of memory" / exit 137 → your swap isn't active, re-check Part 3.

Then start it and make it survive reboots:

```bash
pm2 start "npm run start" --name vidhyalayam
pm2 save
pm2 startup
```

PM2 will print one line beginning with `sudo env PATH=... pm2 startup systemd...` — **copy that whole line and run it**.

Test the app directly (bypassing Nginx):

```bash
curl -I http://127.0.0.1:3000
```

You should see `HTTP/1.1 200 OK`.

---

## Part 9 — Domain + HTTPS (Nginx + Certbot)

Create the Nginx config:

```bash
nano /etc/nginx/sites-available/vidhyalayam
```

Paste:

```nginx
server {
    listen 80;
    server_name erp.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        client_max_body_size 20M;
    }
}
```

Enable and reload:

```bash
ln -s /etc/nginx/sites-available/vidhyalayam /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

Now the app should load at `http://erp.yourdomain.com`. Then add free HTTPS:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d erp.yourdomain.com
```

Follow the prompts (enter an email, accept terms). It auto-configures HTTPS and renewal. That's it — your site is now `https://erp.yourdomain.com` with a valid certificate that renews itself.

---

## Part 10 — Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

Don't enable this before confirming SSH works (it does — you're connected). Your VPS is now locked down: SSH, 80, 443 only.

---

## Part 11 — Optional: Redis + background workers

Skip this at first. If demand-slip generation for big batches feels slow later, do:

```bash
apt install -y redis-server
systemctl enable --now redis-server
```

Add to `.env`:

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

Restart app + start the 4 workers:

```bash
pm2 restart vidhyalayam
pm2 start "npm run worker:demand-slips" --name worker-demand
pm2 start "npm run worker:notifications" --name worker-notifications
pm2 start "npm run worker:exports" --name worker-exports
pm2 start "npm run worker:audit-retention" --name worker-audit
pm2 save
```

---

## Part 12 — First login & security checklist

1. Open `https://erp.yourdomain.com` → login with `admin@dpsdelhi.in` / `admin123`
2. **Immediately**: change the school admin password (your app has a change-password flow — check settings/profile)
3. Log in as super admin (`sahyog.vidhyalayam@gmail.com` / `admin123`) and change that too
4. Consider deleting/renaming the demo school or adding your real school
5. Keep `.env` backed up somewhere safe (it's the only thing you can't regenerate)

---

## Part 13 — Updating the app later

```bash
cd /var/www/my-digital-acadmey-v1.0
git pull
npm install
npx prisma generate
npx prisma migrate deploy   # applies new migrations if any
npm run build
pm2 restart vidhyalayam
```

---

## Part 14 — Troubleshooting (the errors you'll actually hit)

| Error / symptom | Cause | Fix |
|---|---|---|
| `prisma generate` fails with "engine not found" | wrong Node | `nvm use 22` first |
| Build killed, exit code 137 | RAM exhausted | swap active? `free -h`; add `NODE_OPTIONS=--max-old-space-size=1536 npm run build` |
| Nginx shows 502 Bad Gateway | app down | `pm2 status`; `pm2 logs vidhyalayam --lines 50` |
| White page / "Application error" | app crashed after start | `pm2 logs vidhyalayam` |
| Login fails immediately | wrong `JWT_SECRET` or DB connection | check `DATABASE_URL` in `.env`, then `pm2 restart vidhyalayam` |
| Photos don't upload (500) | `public/uploads` not writable | `chown -R www-data:www-data /var/www/my-digital-acadmey/public/uploads` (or just `chmod -R 775`) |
| Port 3000 already in use | app started twice | `pm2 delete vidhyalayam && pm2 start "npm run start" --name vidhyalayam` |
| "Migrate: No migrations found" | wrong DB (fresh empty) | `npx prisma migrate deploy` from the project dir with correct `.env` |
| Certificate expired | renewal timer broken | `systemctl list-timers | grep certbot`; re-run `certbot renew` |
| Everything works but slow first load | cold start / no Redis | normal; add Redis + workers later (Part 11) |
| `bun: command not found` on seed | shell not reloaded | `source ~/.bashrc` or re-login |

---

## Part 15 — Handy commands

```bash
pm2 status                  # is the app running?
pm2 logs vidhyalayam        # live logs (Ctrl+C to exit)
pm2 restart vidhyalayam     # restart after config change
pm2 startup                 # re-run if PM2 stops surviving reboots
systemctl status nginx      # nginx health
free -h                     # RAM/swap check
```

---

**Suggested first run:** do Parts 1–10 in one sitting (~1 hour). Two things to watch specifically: (1) don't skip `prisma generate` before `npm run build`, (2) make sure HTTPS is up before logging in, because the auth cookies are Secure-only in production.
