# Vidhyalayam ERP — Deployment Scalability Guide

How good is the Hostinger VPS deployment (see `DEPLOYMENT.md`), and how to scale it when you grow.

## Verdict

- **For 1 school or a demo → excellent.** Simplest setup that just works.
- **For a serious multi-school SaaS → single point of failure.** One VPS = if it dies, everything dies (app + DB + files).
- The good news: the codebase was architected for scale (R2 storage option, Redis queue with sync fallback, multi-tenant by school, `connection_limit` in DATABASE_URL). The deployment just doesn't use those yet.

---

## What's good about this setup

| Thing | Why it's good |
|---|---|
| Single box | Cheap, simple, one place to debug |
| Nginx + PM2 | Standard, well-trodden path, easy to extend |
| Prisma migrations | Schema changes are versioned — safe to scale later |
| Sync fallback for queues | App works even before you add Redis |
| R2/local storage abstraction | Files can move off-box with one env change |

---

## The real bottlenecks (in order)

1. **RAM** — KVM 2 (~4GB) runs Next.js + Postgres + 4 workers tightly. First thing you'll hit.
2. **Single point of failure** — no redundancy on a $10 VPS.
3. **Local file storage** — uploads live on the VPS; a rebuild/reinstall loses them. VPS disk is also not backed up.
4. **No backups configured** — `DEPLOYMENT.md` didn't include a DB backup cron (see below).
5. **One app instance** — all users hit one Node process. Fine up to roughly hundreds of concurrent users.

---

## The scaling ladder (do this in order, only when needed)

```
Stage 1 (now)     → KVM 2 single box          → launch it
Stage 2 (busy)    → KVM 8 VPS (more RAM)      → bigger box, nothing else changes
Stage 3 (growth)  → separate Postgres VPS     → app box + DB box
                    + files to R2              → STORAGE_DRIVER=r2 (already coded)
                    + Redis + 4 workers        → already coded, just enable
Stage 4 (SaaS)    → 2+ app instances behind
                    Nginx load balancing       → horizontal, workers scale out
                    managed Postgres           → Hostinger/Neon/Supabase
```

---

## Add backups now (before anything else)

Without this, a crash = school data gone:

```bash
crontab -e
# add this line (runs daily at 3am, keeps 7 days):
0 3 * * * PGPASSWORD='STRONG_DB_PASSWORD' pg_dump -h 127.0.0.1 -U vidhya -d vidhyalayam | gzip > /var/backups/vidhyalayam-$(date +\%F).sql.gz && find /var/backups -name 'vidhyalayam-*' -mtime +7 -delete
```

Restore test (make sure backups actually work):

```bash
gunzip -c /var/backups/vidhyalayam-YYYY-MM-DD.sql.gz | psql -h 127.0.0.1 -U vidhya -d vidhyalayam
```

---

## Stage 3 checklist (the practical upgrade path)

1. **Files → R2** (Cloudflare free tier): create bucket + API token, then set in `.env`:
   ```env
   STORAGE_DRIVER=r2
   R2_ACCOUNT_ID=<your account id>
   R2_ACCESS_KEY_ID=<token key>
   R2_SECRET_ACCESS_KEY=<token secret>
   R2_BUCKET=erp-files
   R2_PUBLIC_URL=https://pub-<hash>.r2.dev
   ```
   Restart: `pm2 restart vidhyalayam`. No code changes needed.

2. **Redis + workers** (see `DEPLOYMENT.md` Part 11): enables background demand-slip generation, notification delivery, and tenant exports off the request path.

3. **Separate DB box** (when Postgres competes with the app for RAM):
   - Provision a second VPS, install Postgres there, run `pg_dump`/`pg_restore` to move data
   - Point `DATABASE_URL` at the new host
   - Keep backups on the DB box

---

## Stage 4 notes (multi-school SaaS at scale)

- Run 2+ `next start` instances (or one per CPU core) behind Nginx `upstream` with `least_conn`
- Scale the 4 BullMQ workers onto their own instance — they're already queue-based, so they scale horizontally for free
- Move to managed Postgres (Neon/Supabase/Hostinger) for automatic failover + backups
- Add monitoring before you need it: PM2 logs are basic — consider UptimeRobot (free) for uptime alerts and a `pg_dump` success check in the cron

---

## Bottom line

Deploy as-is for your first school — don't over-engineer before you have users. The moment you have 2+ schools or real traffic, do Stage 3 (R2 + Redis + separate DB), which the codebase supports with just env-var changes.
