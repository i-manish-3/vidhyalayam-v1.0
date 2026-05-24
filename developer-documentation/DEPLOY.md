# Deployment Guide

This document describes how to safely deploy schema and data changes to **production**. Read it once before your first production deploy, then return to it before any future release that includes a schema change or a data backfill.

The local-dev workflow is documented in the [README](../README.md) — this file is specifically for **production**.

---

## 1. Standard Release Flow (No Schema Changes)

If your release only changes application code (no `prisma/schema.prisma` edit, no new backfill script), just deploy the app. Nothing in this document applies.

---

## 2. Release Flow With Schema Changes

The project uses **`prisma db push`** for schema sync — not versioned migrations. That means there is no migration log. The schema in `prisma/schema.prisma` is the source of truth, and `db:push` makes the database match it.

### The Golden Rule — Deploy Order

```
1. Take a database backup
2. Run the diagnostic checks for the change (if any)
3. Apply schema change       → bun run db:push
4. Run data backfill         → bun run scripts/<backfill-script>.ts
5. Deploy new app code
6. Verify in browser
```

**Never skip step 1.** Never run step 5 before step 3 — the new code may read columns that don't exist yet.

### Why this order matters

| What happens if you... | Result |
|---|---|
| Skip step 1 (no backup) | A failed migration leaves you with no rollback path. |
| Skip step 2 (no diagnostic) | A bad data assumption (cross-school links, dangling pointers) gets merged into the new schema and is hard to undo. |
| Run app code before schema push | App crashes on every request that touches the new column. |
| Run app code before backfill | Existing rows appear "empty" to users for the duration of the backfill window. |

---

## 3. Production Pre-Deploy Checklist

Run through this before **every** release that includes a schema change.

- [ ] **Database backup taken** (snapshot, pg_dump, or hosting-provider equivalent)
- [ ] **Migration tested in a staging environment** that mirrors production data shape
- [ ] **Backfill script run in dry-run mode** on staging — log output reviewed
- [ ] **Diagnostic queries run on production** (cross-school checks, dangling FK checks, row counts) — see Section 5
- [ ] **Low-traffic window scheduled** (early morning / weekend if possible)
- [ ] **Rollback plan documented** — typically: restore backup, redeploy previous app version
- [ ] **Team notified** in your release channel (Slack, Discord, etc.)
- [ ] **Admissions paused** (optional, cleanest) if the change touches the admission flow

---

## 4. Deploy Sequence — Step by Step

### Step 1 — Backup

```bash
# Example for managed Postgres (Supabase, Neon, RDS):
# Use the provider's snapshot feature

# Example for self-hosted:
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M).sql
```

### Step 2 — Diagnostics

Run any diagnostic scripts shipped with the release (see Section 5 for the family-id migration as an example). If a diagnostic returns unexpected counts, **stop and investigate** — do not proceed.

### Step 3 — Schema push

```bash
bun run db:push
```

Watch the output. `prisma db push` will print every column / index / constraint change. Confirm the changes match what `prisma/schema.prisma` says.

If `db:push` warns about data loss (e.g. dropping a column with values), **stop and read carefully** before answering the prompt.

### Step 4 — Backfill (if applicable)

Run any data-migration scripts shipped with the release:

```bash
bun run scripts/<script-name>.ts
```

These scripts are **idempotent** — safe to re-run if interrupted. Always review the printed summary (rows touched, families formed, etc.) and confirm it matches expectations.

### Step 5 — Deploy app code

Deploy via your normal pipeline (Vercel, Render, Docker, etc.).

### Step 6 — Smoke test

Open the app and verify:

- The feature touched by the schema change works
- Existing data is still visible (open a known student, a known fee record, etc.)
- New writes work (try creating one example record)
- Error logs are clean for the first 5 minutes

### Step 7 — Resume admissions

If you paused them in the checklist, resume now.

---

## 5. Multi-Tenant Considerations

This app is multi-tenant — every domain model is scoped by `schoolId`. When writing future backfill scripts:

1. **Iterate per school**, not globally, when relationships only make sense within a school (siblings, parents, fee structures, etc.). This prevents accidental cross-tenant data merging if a stray FK points across schools.
2. **Filter `deletedAt: null`** when reading source data, so soft-deleted records don't influence the migration.
3. **Print per-school counts** in the script output so an operator can spot anomalies (e.g. "School X has 0 families formed" when you expect dozens).

---

## 6. Permissions for New Pages

The permission system has three layers; **a new admin page needs each one** or it will silently bypass access control.

| Layer | File | What it does |
|---|---|---|
| **Catalog** | `prisma/seed/index.ts` (`permissionDefs` array) | Defines every permission code (e.g. `student:update`). Inserted into the `Permission` table on seed. |
| **Per-school grant** | `SchoolPermission` table, seeded in `prisma/seed/index.ts` (post-loop) | Decides which permissions each school *can* hand out. SUPER_ADMIN bypasses. |
| **Sidebar gate** | `src/lib/permission-mappings.ts` (`MODULE_PERMISSION_MAP`) | Hides the menu item from users without the listed permissions. |
| **API gate** | `requirePermission(request, 'foo:bar')` in the route handler | Enforces it server-side. Required because the sidebar gate is purely UX — anyone who knows the URL can still hit the API. |

### Pattern: reusing an existing permission

The "Assign Roll Numbers" page (sidebar entry under Academics → Class) is gated by **`student:update`** — the same permission already used by edit-student. No new catalog entry was needed. Sidebar gate is in `MODULE_PERMISSION_MAP`; API gate is in `src/app/api/school/students/assign-roll-numbers/route.ts` POST handler.

This is the **recommended pattern** when the new page does something covered by an existing permission. It means:
- Zero schema work
- Zero per-school grant work — anyone who can already edit students automatically gets it
- Drop-in deployable

### Pattern: introducing a new permission

If the page warrants its own permission code (granular control, separable from anything existing):

1. Add to `prisma/seed/index.ts` `permissionDefs`:
   ```ts
   { code: 'class:assign-roll', name: 'Assign Roll Numbers', module: 'classes', action: 'update' }
   ```
2. Add the page to `MODULE_PERMISSION_MAP`:
   ```ts
   'assign-roll-numbers': ['class:read', 'class:assign-roll']
   ```
3. Call `requirePermission(request, 'class:assign-roll')` in the API route.
4. Grant it to all existing schools (see below) — otherwise nobody but SUPER_ADMIN can use the page in production.

### Granting a new permission to existing schools

**Local dev:** `bun run db:reset && bun run seed`.

**Production:** running the seed wipes data — don't. Instead, ship a one-time SQL grant:

```sql
INSERT INTO "SchoolPermission" ("id", "schoolId", "permissionId", "grantedBy", "grantedAt")
SELECT
  CONCAT('cuid_', md5(random()::text || s.id || p.id)),
  s.id,
  p.id,
  (SELECT id FROM "User" WHERE role = 'SUPER_ADMIN' AND "deletedAt" IS NULL LIMIT 1),
  NOW()
FROM "School" s
CROSS JOIN "Permission" p
WHERE p.code = '<new:permission:code>'
  AND s."deletedAt" IS NULL
ON CONFLICT DO NOTHING;
```

Or write a small Node script in `scripts/grant-permission-to-all-schools.ts` and run it once after the deploy. Either way, it's an additive insert — no risk of losing existing grants.

### When a route already has `requireRole` but no `requirePermission`

This is the existing convention for some admin endpoints (e.g. `students/promote`). Acceptable for SUPER_ADMIN-only or SCHOOL_ADMIN-only tools, but **not safe** the moment STAFF or TEACHER are added to the role list — those roles can be assigned to anyone in the school. Always add `requirePermission` if the role list contains anything broader than the two admin roles.

---

## 7. Schema-Change Patterns to Prefer

When designing the next schema change, follow these patterns to minimize production risk:

| Pattern | Why |
|---|---|
| Add nullable columns first, fill them in later | New column starts as `NULL` — old code keeps working. |
| Avoid `NOT NULL` defaults on big tables | Postgres rewrites every row → table lock. |
| Don't rename columns | `db push` will drop + recreate, losing data. Add the new name, copy data, drop the old name in a later release. |
| Don't change types in place | Same risk. Add a new column, dual-write, migrate, drop old. |
| Keep legacy fields during transition | `Student.siblingId` was kept even after `familyId` was added — old code paths and badges keep working. |
| Make backfills idempotent | Safe to re-run if interrupted. |
| Make backfills print summary counts | Operator can spot anomalies before continuing. |

---

## 8. Things to NEVER Do in Production

- **Don't `db:reset`** (`prisma migrate reset`) — wipes the entire database. Only safe in local dev.
- **Don't run untested migration scripts.** Test on staging or a restored backup first.
- **Don't skip the backup.** Even for "small" changes. A two-minute backup buys hours of recovery time if something goes wrong.
- **Don't deploy schema change + backfill + app code in one auto-merge to production.** Stage them. Watch each step.
- **Don't run backfills during peak traffic.** Bulk updates compete for connection slots with real users.

---

## 9. After Every Release

- Watch error logs for at least 30 minutes after deploy.
- Spot-check 2-3 random user records to make sure they look right.
- Update this file if you discover a new gotcha worth documenting.

---

## 10. Quick Reference

| Action | Command |
|---|---|
| Backup (self-hosted) | `pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql` |
| Apply schema | `bun run db:push` |
| Run a backfill | `bun run scripts/<name>.ts` |
| Regenerate Prisma client | `bun run db:generate` |
| Local reset (NEVER in prod) | `bun run db:reset` |
| Re-seed (NEVER in prod) | `bun run seed` |
