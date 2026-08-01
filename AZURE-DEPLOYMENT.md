# Deploy Vidhyalayam ERP on Microsoft Azure — Step-by-Step Guide

This guide deploys the Vidhyalayam school ERP (Next.js 16 + Prisma/PostgreSQL, optional Redis) to Azure using:

- **Azure App Service (Linux, Node 22)** — hosts the app, free HTTPS
- **Azure Database for PostgreSQL Flexible Server** — managed database
- **GitHub Actions** — automatic deploy on every push

**What you'll end up with:** `https://your-app.azurewebsites.net` running the ERP, automatic deploys from GitHub, managed Postgres with automated backups.

---

## Part 0 — Things to know about YOUR project

- Needs **Node 22 LTS** and **PostgreSQL 14+** with SSL (`sslmode=require` — Azure requires it)
- **Redis is optional** — without it, demand slips, notifications and exports run synchronously inside the request (slower but works). No Redis = no worker processes to manage.
- **Seed script uses `bun`** — you must install bun locally (Part 3) because App Service only has npm.
- Login after seeding: **`admin@dpsdelhi.in` / `admin123`** (school admin), **`sahyog.vidhyalayam@gmail.com` / `admin123`** (super admin) — change these immediately.
- Auth cookies are `Secure` in production → HTTPS is mandatory. App Service gives you HTTPS free.
- **Uploaded files** (photos, logos, admission docs) are stored in `public/uploads/` by default. App Service's filesystem is **ephemeral** (reset on restarts / lost when scaling out) → you MUST use R2 storage in production (Part 8). This is the single most important Azure-specific caveat.
- Domain: you can use the free `*.azurewebsites.net` URL first, or add your own domain (Part 9).

---

## Part 1 — Prerequisites

1. **Azure account** — https://azure.microsoft.com/free (free tier includes 12 months of some services; App Service + Postgres will cost money after — see Part 11 for cost notes).
2. **GitHub repo** — your code is already on GitHub (`https://github.com/i-manish-3/my-digital-acadmey-v1.0.git`).
3. **Install bun on your Windows PC** (needed for seeding only):
   ```powershell
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```
   Verify: `bun --version`
4. **PostgreSQL client** (optional, for checking the DB): [pgAdmin](https://www.pgadmin.org/download/) or install `psql` via [EDB installer](https://www.enterprisedb.com/download-postgresql-binaries).

---

## Part 2 — Create the database (PostgreSQL Flexible Server)

1. Azure portal → search **"Azure Database for PostgreSQL"** → **Create** → **Flexible Server**.
2. Fill in:
   - **Subscription / Resource group**: pick or create (e.g. `rg-vidhyalayam`)
   - **Server name**: `vidhyalayam-db` (this becomes part of the hostname)
   - **Region**: nearest to your users (e.g. Central India / South India)
   - **PostgreSQL version**: 16 (or 15/14)
   - **Workload type**: Development (smallest tier, B1ms)
   - **Authentication**: **PostgreSQL authentication only** → set admin username `vidhyadmin` and a strong password (SAVE IT — you'll need it for `DATABASE_URL`)
3. Click **Next: Networking**:
   - **Connectivity method**: Public access (allowlisted IP addresses)
   - **Allow public access from any Azure service within Azure**: ✅ **ON** (this lets App Service reach it)
   - Optionally add **your own home/public IP** for testing from your PC.
4. **Next: Security** → leave defaults. **Create** (takes 2–5 minutes).
5. After creation: server → **Databases** → **Add** → create a database named **`vidhyalayam`**.

> You now have a hostname like `vidhyalayam-db.postgres.database.azure.com:5432`. Copy it.

---

## Part 3 — Create the App Service (Linux, Node 22)

1. Azure portal → search **"App Service"** → **Create** → **Web App**.
2. Fill in:
   - **Resource group**: same as the DB (`rg-vidhyalayam`)
   - **Name**: `vidhyalayam-app` → your URL will be `https://vidhyalayam-app.azurewebsites.net`
   - **Runtime stack**: **Node 22 LTS**
   - **Operating system**: **Linux**
   - **Region**: same as DB
   - **Pricing plan**: click **Change size** → **Production** → **P1V2** (2GB RAM / 1 vCPU — minimum for a Next.js build + run. You can scale down to B1 later for testing, but the build can OOM on B1.)
3. **Review + create** → **Create**.

### Configure the app settings (env vars)

1. App Service → **Settings → Configuration** → **Application settings** → **New application setting**.
2. Add every row below (leave empty ones blank only if you don't use that feature):

| Key | Value |
|---|---|
| `DATABASE_URL` | `postgresql://vidhyadmin:<YOUR_DB_PASSWORD>@vidhyalayam-db.postgres.database.azure.com:5432/vidhyalayam?sslmode=require&connect_timeout=30` |
| `JWT_SECRET` | a long random string (generate: `openssl rand -hex 32`) |
| `TOKEN_ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`) |
| `NODE_ENV` | `production` |
| `PUBLIC_APP_URL` | `https://vidhyalayam-app.azurewebsites.net` |
| `STORAGE_DRIVER` | `r2` (after Part 8) — `local` only for testing |
| `WEBSITES_PORT` | `3000` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` (we build in GitHub Actions, not on Azure) |
| `R2_ACCOUNT_ID` | *(R2 values — Part 8)* |
| `R2_ACCESS_KEY_ID` | |
| `R2_SECRET_ACCESS_KEY` | |
| `R2_BUCKET` | |
| `R2_PUBLIC_URL` | |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | *(for password-reset emails — required in production)* |
| `META_WEBHOOK_VERIFY_TOKEN` / `META_APP_SECRET` | *(WhatsApp webhook — optional)* |
| `OPENROUTER_API_KEY` / `CHATBOT_MODEL` | *(AI chatbot — optional)* |
| `FEE_DEMAND_GENERATE_CONCURRENCY` | `5` (default) |
| `WHATSAPP_WORKER_MAX_SCHOOLS` / `WHATSAPP_WORKER_POLL_MS` | `20` / `1500` (defaults) |

3. **General settings** tab → set **Startup Command** to:
   ```
   npx prisma generate && npm run start
   ```
   (regenerates the Prisma client on boot as a safety net; `npm run start` = `next start -p 3000`)
4. **Save** (the app restarts).

---

## Part 4 — Set up automatic deployment (GitHub Actions)

1. In the Azure portal: App Service → **Deployment Center** → **Settings** → **Source**: *GitHub* → connect your repo and branch (`main`). Azure will create `.github/workflows/` for you with a publish profile. **Note the `AZUREAPPSERVICE_PUBLISHPROFILE_...` secret it adds to your repo.**
2. If you prefer your own workflow, use the one below instead. In GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `AZURE_PUBLISH_PROFILE`: the full publish profile XML (App Service → **Overview → Get publish profile** → copy the whole XML)
   - `DATABASE_URL`: the same URL as in Part 3 (used to run migrations in CI)
3. Create `.github/workflows/deploy-azure.yml` in your repo:

```yaml
name: Deploy to Azure App Service

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: npx prisma generate

      - name: Apply database migrations
        run: npx prisma migrate deploy

      - name: Build
        run: npm run build

      - name: Deploy to Azure
        uses: azure/webapps-deploy@v3
        with:
          app-name: vidhyalayam-app
          publish-profile: ${{ secrets.AZURE_PUBLISH_PROFILE }}
          package: .
```

4. Push to `main` → watch the workflow run → it deploys the app to Azure.

> **Migrations note**: `npx prisma migrate deploy` runs on every deploy (it's a no-op when there are no new migrations — safe).

---

## Part 5 — Seed the database (one-time, run from YOUR PC)

The seed must run **once** (it skips itself if a SUPER_ADMIN already exists). Run it against the Azure DB from your local machine:

1. In your repo folder, create a temporary `.env.azure` (do NOT commit it):
   ```
   DATABASE_URL=postgresql://vidhyadmin:<YOUR_DB_PASSWORD>@vidhyalayam-db.postgres.database.azure.com:5432/vidhyalayam?sslmode=require&connect_timeout=30
   ```
2. Run:
   ```powershell
   npm install
   npx prisma generate
   # tell the seed scripts to use the Azure DB
   $env:DATABASE_URL = "postgresql://vidhyadmin:<PASSWORD>@vidhyalayam-db.postgres.database.azure.com:5432/vidhyalayam?sslmode=require&connect_timeout=30"
   npm run seed
   ```
   (The `seed` script uses `bun` — installed in Part 1.)
3. Expect output ending with `✅ Assigned user roles` (and the other ✅ lines). If it says *"Core demo data already exists, skipping."* — the DB isn't empty; that's fine, skip to Part 6.
4. Delete the temp `.env.azure` file.

> Seeding from Azure directly isn't needed — the app is already deployed; it just needs data.

---

## Part 6 — First launch & verification

1. Open `https://vidhyalayam-app.azurewebsites.net`.
2. Log in as **super admin** (`sahyog.vidhyalayam@gmail.com` / `admin123`).
3. Check: Schools page shows **Delhi Public School**; open the school → users, permissions, roles.
4. Test a school admin login (`admin@dpsdelhi.in` / `admin123`) — you may need to switch school in the login dropdown.
5. Check the logs if anything fails: App Service → **Log stream** (live logs), or **Diagnose and solve problems**.

> **First-load warning**: the first HTTPS request compiles the Next.js routes — the first page can take ~30s. After that it's fast. Enable **Always On** (Part 10) so it never sleeps.

---

## Part 7 — TLS / HTTPS

Nothing to do — `https://vidhyalayam-app.azurewebsites.net` comes with a free TLS certificate, auto-renewed. Your own domain (Part 9) also gets free TLS.

---

## Part 8 — File storage: R2 (REQUIRED in production)

App Service filesystem is **ephemeral** — it is wiped on restarts, and instances in a scale-out share no filesystem. With `STORAGE_DRIVER=local`, every logo/photo upload will vanish on the next restart. So:

1. Create a **Cloudflare R2** bucket (https://dash.cloudflare.com → R2 → Create bucket, e.g. `erp-files`).
2. **Manage R2 API Tokens** → Create token → **Object Read & Write** → copy Account ID, Access Key ID, Secret Access Key.
3. Set in App Service configuration:
   - `STORAGE_DRIVER=r2`
   - `R2_ACCOUNT_ID=<account id>`
   - `R2_ACCESS_KEY_ID=<key>`
   - `R2_SECRET_ACCESS_KEY=<secret>`
   - `R2_BUCKET=erp-files`
   - `R2_PUBLIC_URL=...` — bind a custom domain to the bucket (e.g. `https://files.yourdomain.com`) or use the `*.r2.dev` dev URL.
4. Save → app restarts → uploads now go to R2 (durable, survives restarts and scale-out).

**Alternative (stays inside Azure):** mount **Azure Files** to `/home` (App Service → Configuration → Path mappings → map `/home` to an Azure Files share). Simpler to stay with R2 if you already used it.

---

## Part 9 — Custom domain (optional)

1. App Service → **Custom domains** → **Add** → type `erp.yourdomain.com` → copy the CNAME record it shows.
2. At your DNS provider: add `CNAME erp → vidhyalayam-app.azurewebsites.net`.
3. Back in Azure: **Validate** → **Add**. TLS certificate is issued automatically (HTTPS only → **On**).
4. Update `PUBLIC_APP_URL` to `https://erp.yourdomain.com` and restart the app.

---

## Part 10 — Production hardening & maintenance

| Item | How |
|---|---|
| **Always On** | App Service → Configuration → General settings → **Always On: ON** (prevents 20-min idle shutdown; required if you want the app warm) |
| **Change default passwords** | Immediately: super admin + school admin logins (Settings in the app). Rotate `JWT_SECRET`/`TOKEN_ENCRYPTION_KEY` only before go-live, never after (see .env.example warning). |
| **DB backups** | Postgres Flexible Server backs up automatically (default 7 days retention; enable geo-redundancy if you want off-region copies). |
| **Extra safety backup (cron)** | On a small VM or the App Service — schedule daily: `pg_dump` to a storage account. Azure portal → Automation → pick a machine with `pg_dump` (or use App Service **WebJobs/Logic Apps**). Simplest: GitHub Actions cron job with `actions/checkout` + `pg_dump` to an Azure Blob Storage account. |
| **Scale out** | App Service → **Scale out** — safe to run multiple instances ONLY with `STORAGE_DRIVER=r2` (no local files) and the managed DB. |
| **Workers** | The 4 BullMQ workers only matter if you add Redis (Azure Cache for Redis). Without Redis, everything runs in-request — nothing extra to deploy. |
| **Logs** | App Service → Log stream; enable **App Service logs** (filesystem) for permanent logs. |

---

## Part 11 — Cost estimate (rough)

| Resource | Tier | Approx. cost/month |
|---|---|---|
| App Service P1V2 (Linux) | P1V2 (2GB RAM) | ~$70–80 |
| PostgreSQL Flexible Server | B2ms / B1ms | ~$25–40 |
| Cloudflare R2 | free tier 10 GB | $0 |
| **Total** | | **~$100–120/month** |

> Cheaper test setup: App Service **B1** (~$13) + Postgres **B1ms** (~$25) = ~$40/month, but the Next.js build may OOM on B1 — build in GitHub Actions (we do) and it's fine. Scale up to P1V2 when real users arrive.

---

## Part 12 — Troubleshooting

| Symptom | Fix |
|---|---|
| `PrismaClientInitializationError` / connection refused | Wrong `DATABASE_URL`; verify SSL `sslmode=require`; check Postgres firewall has *Allow Azure services* ON; try `psql` from your PC with the same URL |
| Build OOM in CI | GitHub Actions runner has 7GB — fine. If building locally instead: use `NODE_OPTIONS=--max-old-space-size=4096` |
| Uploads disappear after restart | `STORAGE_DRIVER` is still `local` → switch to `r2` (Part 8) |
| App loads but login fails | Run migrations (Part 4 workflow) — schema mismatch → re-deploy once; check Log stream for errors |
| First page takes 30s | Normal (route compilation). Turn on **Always On** |
| `next start` port error | `WEBSITES_PORT=3000` must be set (Part 3) |
| Seed says "already exists" | DB has partial data → reset DB and re-seed, or keep going (app works with existing data) |
| WhatsApp demand slips not sending | Need `SMTP_*`? No — WhatsApp needs Meta config + Redis/workers or synchronous mode. Check `META_WEBHOOK_VERIFY_TOKEN`/`META_APP_SECRET` and R2 public URL for slip links |

---

That's it — you're live. Final checklist:

- [ ] DB created + `vidhyalayam` database + firewall allows Azure
- [ ] App Service created + all Application settings set
- [ ] GitHub Actions workflow pushed & green
- [ ] `npm run seed` completed against Azure DB (once)
- [ ] Super admin login works on `https://vidhyalayam-app.azurewebsites.net`
- [ ] `STORAGE_DRIVER=r2` set (uploads durable)
- [ ] Always On enabled, default passwords changed
