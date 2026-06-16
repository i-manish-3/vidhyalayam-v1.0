# Production Deployment Plan

This plan is based on the current repository shape as of 2026-06-16.

The system has two deployable surfaces:

- `my-digital-acadmey`: Next.js 16 web app plus API routes, Prisma, background workers, and scheduled jobs.
- `vidhyalayam-mobile`: Expo mobile app that talks to the same backend via `EXPO_PUBLIC_API_URL`.

The main goal for v1 is a stable single-production backend that can serve web users and mobile clients, while leaving room for v2/mobile updates to coexist without breaking v1.

## 1. Current Architecture Snapshot

### Web/backend app

- Framework: Next.js 16, React 19, TypeScript, Tailwind CSS.
- Runtime: Node.js, not pure static/serverless.
- Database: PostgreSQL through Prisma.
- Auth:
  - Web uses HttpOnly cookies: `erp_access`, `erp_refresh`.
  - Mobile uses `/api/mobile/auth/*` and bearer tokens stored in Expo SecureStore.
  - Both share the same auth core and `JWT_SECRET`.
- Multi-tenancy: tenant data is scoped by `schoolId`.
- File uploads:
  - Dev: `public/uploads`.
  - Production target: Cloudflare R2 through `STORAGE_DRIVER=r2`.
- Background work:
  - BullMQ/Redis queues for demand slips, notifications, tenant exports.
  - In-process WhatsApp bulk sender for Meta Cloud demand-slip delivery.
  - Audit retention worker intended for scheduled execution.
- Realtime:
  - Notification SSE endpoint at `/api/school/notifications/stream`.
  - Redis Pub/Sub is used when Redis is configured.

### Mobile app

- Expo Router app.
- API base URL is controlled by `EXPO_PUBLIC_API_URL`.
- Production mobile builds must target the same HTTPS backend origin used by web, or a stable API subdomain that proxies to it.
- TypeScript check currently passes with `npx tsc --noEmit`.

## 2. Production Hosting Recommendation

Use a persistent Node hosting model for v1. A VPS or container host is the safest fit because the app has long-lived SSE connections, queue workers, and an in-process WhatsApp sender.

Recommended v1 topology:

```text
Internet
  |
  v
Caddy/Nginx reverse proxy with HTTPS
  |
  +--> Next.js web/API process on port 3000
  |
  +--> Redis, private network only
  |
  +--> PostgreSQL, managed preferred
  |
  +--> Worker processes:
       - demand slip worker
       - notification delivery worker
       - tenant export worker
       - scheduled audit retention job
```

Prefer managed PostgreSQL for launch: Neon, Supabase, RDS, or another provider with automatic backups and point-in-time recovery. Redis can be managed or local to the VPS, but it must not be exposed publicly.

Avoid a fully serverless deployment for v1 unless the WhatsApp bulk worker is moved from in-process polling to a real queue. The code comments already call out multi-instance/serverless risk in `src/lib/whatsapp/bulk-worker.ts`.

## 3. Required Production Environment

Set these before first deploy:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...?...connection_limit=50&pool_timeout=20
JWT_SECRET=<48+ byte random secret>
TOKEN_ENCRYPTION_KEY=<64 hex chars from openssl rand -hex 32>
PUBLIC_APP_URL=https://app.yourdomain.com

STORAGE_DRIVER=r2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=erp-files
R2_PUBLIC_URL=https://files.yourdomain.com

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
USE_QUEUE=true

SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="Vidhyalayam <noreply@yourdomain.com>"

META_WEBHOOK_VERIFY_TOKEN=...
META_APP_SECRET=...

FEE_DEMAND_GENERATE_CONCURRENCY=5
WHATSAPP_WORKER_MAX_SCHOOLS=20
WHATSAPP_WORKER_POLL_MS=1500
NOTIFICATION_QUEUE_CONCURRENCY=10
EXPORT_QUEUE_CONCURRENCY=2
EXPORT_RETENTION_DAYS=7
AUDIT_RETENTION_DAYS=365
AUDIT_ARCHIVE_ENABLED=false
```

Mobile production build:

```env
EXPO_PUBLIC_API_URL=https://app.yourdomain.com
```

Important:

- Do not change `TOKEN_ENCRYPTION_KEY` after schools save WhatsApp tokens unless you first decrypt and re-encrypt existing values.
- Do not rotate `JWT_SECRET` casually. Today that is a global session reset.
- In production, missing SMTP config can throw when password reset email is sent.
- `DATABASE_URL` should include a sensible Prisma pool limit for multi-tenant use.

## 4. Pre-v1 Readiness Fixes

These should be completed before the first production release.

1. Add deployment process files.
   - Add either a Dockerfile + compose/host config, or systemd/PM2 process definitions.
   - The repo currently has no Dockerfile, compose file, PM2 ecosystem file, systemd unit, Vercel config, or Render config.

2. Add a health endpoint.
   - Add `/api/health` for process liveness.
   - Add `/api/ready` for DB and Redis readiness.
   - Reverse proxy or uptime monitor should hit these.

3. Fix CI gates.
   - `bun run build` passes only when Google Fonts are reachable.
   - `bun run lint` currently fails.
   - `next.config.ts` has `typescript.ignoreBuildErrors=true`; do not depend on build alone as the quality gate.

4. Decide font strategy.
   - Current `src/app/layout.tsx` uses `next/font/google` for Geist and Geist Mono.
   - Either allow outbound network during CI builds or vendor/localize fonts with `next/font/local`.

5. Update queue worker docs.
   - `package.json` uses:
     - `bun run worker:demand-slips`
     - `bun run worker:notifications`
     - `bun run worker:exports`
   - Some docs still mention `src/workers/start-worker.js`; that path uses `dotenv` but `dotenv` is not listed in dependencies. Use the package scripts for production process definitions.

6. Make mobile lint deterministic.
   - `npx tsc --noEmit` passes.
   - `npm run lint` tried to auto-configure ESLint and did not complete in the sandbox. Commit a fixed Expo ESLint config before using lint as a CI gate.

7. Add monitoring.
   - Capture app errors and worker errors in Sentry/Logtail/Datadog or equivalent.
   - Track queue backlog, failed jobs, DB connection saturation, 5xx rate, auth failures, and webhook failures.

## 5. CI/CD Pipeline

Use one pipeline for the backend and one for mobile.

### Backend pipeline

Run on every PR:

```bash
bun install --frozen-lockfile
bun run db:generate
bun run lint
bun run build
npx tsc --noEmit
```

Recommended tests before merging release branches:

```bash
bun test
npx playwright test
```

If tests need a seeded database, create a disposable Postgres database, run:

```bash
bun run db:push
bun run seed
```

Do not run seeds against production.

### Mobile pipeline

Run on every PR:

```bash
npm ci
npx tsc --noEmit
npm run lint
```

For release builds, use EAS Build or the chosen native pipeline with:

```bash
EXPO_PUBLIC_API_URL=https://app.yourdomain.com
```

## 6. First Production Deployment Sequence

1. Provision infrastructure.
   - Domain and HTTPS reverse proxy.
   - Managed PostgreSQL.
   - Redis.
   - R2 bucket and public file domain.
   - SMTP provider.
   - Meta WhatsApp webhook endpoint if WhatsApp is enabled.

2. Create production database.
   - Set `DATABASE_URL`.
   - Run `bun run db:generate`.
   - Run `bun run db:push`.
   - Do not run demo seed scripts in production unless this is an empty demo environment.

3. Create first platform admin safely.
   - Add a one-time script or SQL insert for the first `SUPER_ADMIN`.
   - Delete or disable the bootstrap path after use.

4. Start backend.
   - Build: `bun run build`.
   - Start: `bun run start`.
   - Ensure `NODE_ENV=production`.

5. Start workers.
   - `bun run worker:demand-slips`
   - `bun run worker:notifications`
   - `bun run worker:exports`
   - Schedule audit retention monthly:
     - `tsx src/workers/audit-retention-worker.ts`

6. Configure reverse proxy.
   - Route HTTPS traffic to port 3000.
   - Disable response buffering for SSE.
   - Allow webhook paths.
   - Set body size high enough for uploads, if uploads still arrive as base64 payloads.

7. Smoke test.
   - Web login.
   - Mobile login against production URL.
   - Create/read/update one school-scoped record.
   - Upload logo/student image and verify R2 URL.
   - Generate one demand slip.
   - Queue a bulk demand slip job and check `/runs/:runId`.
   - Send one WhatsApp test if enabled.
   - Password reset email.
   - Notification SSE connection.

8. Enable monitoring and backups.
   - Watch logs for at least 30 minutes.
   - Confirm DB backups and restore procedure.
   - Confirm Redis is private.
   - Confirm R2 objects are public only through intended URL.

## 7. Release Flow After v1

Follow the existing production guide in `developer-documentation/DEPLOY.md`.

For code-only releases:

```text
1. Build and test
2. Deploy app code
3. Restart workers if worker code changed
4. Smoke test
5. Watch logs
```

For schema releases:

```text
1. Take database backup
2. Test schema change on staging
3. Run diagnostics
4. Apply schema with bun run db:push
5. Run idempotent backfill scripts
6. Deploy app code
7. Restart workers
8. Smoke test
9. Watch logs
```

Never run these in production:

```bash
bun run db:reset
bun run seed
```

## 8. Compatibility Plan For v1 + Future Versions

The backend should be treated as a contract because mobile clients may remain on old versions for weeks or months.

### API compatibility rules

1. Never remove or rename response fields used by v1 mobile/web clients.
2. Add new fields as optional.
3. Keep old fields during one full release cycle after replacement.
4. Do not change auth token shape without supporting both old and new token formats.
5. Do not change mobile auth routes without keeping:
   - `/api/mobile/auth/login`
   - `/api/mobile/auth/refresh`
   - `/api/mobile/auth/logout`
6. For breaking changes, create versioned routes:
   - `/api/mobile/v1/...`
   - `/api/mobile/v2/...`

### Database compatibility rules

Use expand-and-contract migrations:

```text
Release A:
  - Add nullable new column/table
  - Dual-write old and new fields where needed
  - Backfill existing rows

Release B:
  - Read from new field, fallback to old field
  - Keep old field

Release C:
  - Remove fallback only after all supported clients are upgraded
  - Drop old field in a later maintenance release
```

Avoid direct rename/type-change with `prisma db push`; it can drop and recreate columns.

### Mobile version strategy

For v1 mobile:

- Build against `EXPO_PUBLIC_API_URL=https://app.yourdomain.com`.
- Keep v1 API behavior stable.
- Add a lightweight endpoint later, for example `/api/mobile/app-version`, returning:
  - minimum supported app version
  - latest app version
  - maintenance banner
  - force-update flag

For v2 mobile:

- Prefer additive backend changes.
- If a breaking contract is unavoidable, add `/api/mobile/v2/*` while keeping `/api/mobile/*` alive for v1.
- Keep auth shared unless token behavior changes.

### Web version strategy

Web can be updated faster than mobile because users load the latest app from the server. Still, use backwards-compatible database changes so old worker processes or rolling deployments do not crash during release.

## 9. Rollback Plan

For code-only rollback:

```text
1. Repoint process manager/container to previous build
2. Restart web and workers
3. Confirm health/readiness
4. Watch logs
```

For schema rollback:

```text
1. Stop app and workers if data corruption risk exists
2. Restore database backup or run a verified reverse migration
3. Deploy previous app build
4. Restart workers
5. Smoke test known records
```

For mobile rollback:

- Mobile binaries cannot be reliably recalled after users install them.
- Use server-side compatibility and app-version gating instead of assuming rollback.

## 10. Operational Checklist

Daily after launch:

- Check app 5xx logs.
- Check worker process status.
- Check Redis memory and failed jobs.
- Check DB connection count and slow queries.
- Check WhatsApp webhook failures.
- Check storage upload failures.

Weekly:

- Verify database backups.
- Restore latest backup into staging.
- Check R2 storage growth.
- Review failed login spikes.

Monthly:

- Run audit retention job.
- Review dependency/security updates.
- Review queue concurrency against real school usage.

## 11. Current Verification Notes

Checks run locally:

- `bun run build` in `my-digital-acadmey` passed when network access was allowed for Google font fetching.
- `bun run build` failed without network because `next/font/google` could not fetch Geist fonts.
- `bun run lint` in `my-digital-acadmey` failed with 15 errors.
- `npx tsc --noEmit` in `vidhyalayam-mobile` passed.
- `npm run lint` in `vidhyalayam-mobile` attempted Expo ESLint auto-configuration and did not complete cleanly.

Known backend lint failures include:

- CommonJS `require()` usage in JS helper scripts.
- React hooks lint errors for synchronous state updates in effects.
- `useMultiFileAuthState` from Baileys is detected as a React hook by ESLint in `src/lib/whatsapp/baileys.ts`.

These do not currently block `next build` because TypeScript validation is skipped in `next.config.ts`, but they should be cleaned up before v1 if CI lint is treated as the release gate.

