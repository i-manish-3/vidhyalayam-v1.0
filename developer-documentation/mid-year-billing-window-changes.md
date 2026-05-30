# Mid-Year Billing Window Changes — Design

This document specifies the production-ready design for three mid-year billing-window changes:

1. **Student leaves the school mid-year** (Transfer Certificate / drop-out / mid-year transfer)
2. **Student takes transport facility mid-year** (was not on transport, now wants it)
3. **Student discontinues transport facility mid-year** (was on transport, now wants to stop)

All three are variations of the same operation — opening or shrinking a per-student fee billing window — and share a single core helper, audit pattern, and UX flow.

---

## 1. Mental model: the billing window

Each kind of fee billing has a **window** defined by `(effectiveFrom, effectiveTo)`:

| Subject | Scope | Window owner |
|---|---|---|
| Student | Academic fees | `StudentFeeAssignment.effectiveFrom / effectiveTo / status` |
| Student | Transport fees | `TransportAllocation.effectiveFrom / effectiveTo / changeReason` |

Four operations on a window:

| Operation | When it fires |
|---|---|
| **OPEN** | Admission, mid-year transport add, rejoin after withdrawal |
| **SHRINK FORWARD** | TC issued, transport discontinued — set `effectiveTo` to the closure date |
| **EXTEND / REOPEN** | Erroneous TC reversed, rejoin transport — clear `effectiveTo` |
| **CHAIN** | Route change with same start, fare revision — close current allocation + open new one chained via `previousAllocationId` |

The pro-rate fix for late admission already implements OPEN with `effectiveFrom`. This design adds SHRINK FORWARD and the helpers needed to do it safely.

---

## 2. Schema changes

All changes are **additive**: new optional columns and new tables. No backward-incompatible alterations.

### 2.1 `TransportAllocation` — add window + audit fields

```prisma
model TransportAllocation {
  // ... existing fields ...
  effectiveFrom         DateTime?    // when transport liability begins
  effectiveTo           DateTime?    // when it ends (null = open)
  changeReason          String?      // INITIAL | CHANGED | WITHDRAWN | REJOIN |
                                     // FARE_REVISION | YEAR_ROLLOVER | STUDENT_WITHDRAWN
  previousAllocationId  String?      // FK to predecessor (when chained)
  withdrawnBy           String?      // userId who closed the allocation
  withdrawalNotes       String?      // reason text
  cascadeFromWithdrawal Boolean      @default(false)
                                     // true if closed because student TC'd
}
```

Existing `isActive: Boolean` is **kept** for fast filtering but its meaning is tightened: `isActive = (effectiveTo IS NULL OR effectiveTo > now())`. Application sets both fields together.

### 2.2 `StudentWithdrawal` — new table for TC/drop-out audit

```prisma
model StudentWithdrawal {
  id              String    @id @default(cuid())
  schoolId        String
  studentId       String
  academicYear    String
  effectiveDate   DateTime              // last day of enrollment
  reason          String                // TC | DROPOUT | TRANSFER | COMPLETED | OTHER
  reasonNotes     String?
  refundEligible  Boolean   @default(false)   // refundable deposits flag
  cancelledItemsJson String?             // JSON snapshot of cancelled item IDs + totals
  cancelledAmount  Float    @default(0)
  totalRefundDue   Float    @default(0)   // sum of paid amounts on skipped items
  performedBy      String?               // userId
  reversedAt       DateTime?             // erroneous-TC reversal stamp
  reversedBy       String?
  reversalNotes    String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  deletedAt        DateTime?

  school   School  @relation(fields: [schoolId], references: [id])
  student  Student @relation(fields: [studentId], references: [id])

  @@unique([studentId, academicYear])    // one withdrawal per (student, AY)
  @@index([schoolId])
  @@index([studentId])
  @@index([effectiveDate])
}
```

### 2.3 `TransportEvent` — new table for transport history timeline

```prisma
model TransportEvent {
  id                    String   @id @default(cuid())
  schoolId              String
  studentId             String
  academicYear          String
  eventType             String   // CREATED | CHANGED | WITHDRAWN | REJOINED | FARE_REVISED
  fromAllocationId      String?
  toAllocationId        String?
  fromRouteId           String?
  toRouteId             String?
  fromStop              String?
  toStop                String?
  effectiveDate         DateTime
  cancelledMonths       String?    // JSON: ["Oct","Nov","Dec"]
  cancelledAmount       Float    @default(0)
  reason                String?
  performedBy           String?
  cascadeFromWithdrawal Boolean  @default(false)
  createdAt             DateTime @default(now())

  school  School  @relation(fields: [schoolId], references: [id])

  @@index([schoolId])
  @@index([studentId, academicYear])
  @@index([eventType])
}
```

### 2.4 Migration backfill

After `prisma db push`, run a backfill script:

```sql
-- All existing active TransportAllocations:
UPDATE "TransportAllocation"
SET "effectiveFrom" = "createdAt",
    "changeReason" = 'INITIAL'
WHERE "effectiveFrom" IS NULL;

-- Backfill TransportEvent CREATED rows for them:
INSERT INTO "TransportEvent" (...)
SELECT ... FROM "TransportAllocation" WHERE ...
```

Backfill ships as `scripts/backfill-transport-windows.ts` with `--dry-run` default.

---

## 3. The core helper: `applyAssignmentWindow`

Single function that handles **shrinking** a billing window — used by all three scenarios.

### 3.1 Location

`src/lib/billing-window.ts`

### 3.2 Signature

```ts
type WindowScope = 'academic' | 'transport'

interface ApplyWindowArgs {
  tx: Prisma.TransactionClient
  schoolId: string
  studentId: string
  scope: WindowScope
  assignmentId?: string         // required when scope='academic'
  allocationId?: string         // required when scope='transport'
  effectiveTo: Date             // shrink-to date
  reason: string                // STUDENT_WITHDRAWN | WITHDRAWN | CHANGED | …
  reasonNotes?: string | null
  performedBy: string | null
  dryRun?: boolean              // preview only; no writes
}

interface SkippedItem {
  id: string
  feeHeadName: string
  installmentName: string | null
  dueDate: Date | null
  originalAmount: number
  allocatedAmount: number       // sum of payment + waiver allocations to date
}

interface CancelledItem {
  id: string
  feeHeadName: string
  installmentName: string | null
  dueDate: Date | null
  amount: number
}

interface WindowChangeResult {
  cancelledItems: CancelledItem[]
  cancelledAmount: number
  skippedDueToAllocations: SkippedItem[]
  totalRefundable: number       // sum of allocatedAmount across skipped items
  newEffectiveTo: Date
}
```

### 3.3 Algorithm

1. Load the assignment / allocation row. Reject if not owned by `schoolId`.
2. Identify items past the boundary:
   - **Academic**: `StudentFeeAssignmentItem` where `dueDate > effectiveTo` AND `status='active'`.
   - **Transport**: `FeeCollection` rows linked to this allocation where `dueDate > effectiveTo` AND not soft-deleted; OR, if the schema doesn't expose that link directly, walk `StudentFeeLedgerEntry` where `sourceType='transport' AND studentId=… AND dueDate > effectiveTo AND status!='cancelled'`.
3. For each candidate item, count its non-zero `StudentFeeLedgerAllocation` rows (against its DEBIT entry).
4. Split into two buckets:
   - **`skippedDueToAllocations`**: any item with allocations. We never auto-cancel paid debits — refund decisions are manual.
   - **`cancelledItems`**: items with zero allocations.
5. If `dryRun`: return the result struct without writing.
6. Otherwise, in the supplied transaction:
   - Mark each `cancelledItems` `StudentFeeAssignmentItem.status = 'cancelled'` (academic) or soft-delete the `FeeCollection` rows (transport).
   - Cancel each DEBIT `StudentFeeLedgerEntry` (`status='cancelled', deletedAt=now`).
   - Mark linked `StudentFeeInvoiceLine.status='cancelled'`.
   - Update the parent assignment/allocation: `effectiveTo`, `status='closed'` (academic) or `isActive=false, changeReason, withdrawnBy, withdrawalNotes` (transport).
   - Write a `FeeAuditLog` row with the full JSON snapshot of cancelled + skipped.
7. Return the result struct.

### 3.4 Safety properties

- **Tenant-scoped**: every query filters by `schoolId`.
- **Allocation-safe**: never modifies a debit that has received any non-zero allocation.
- **Atomic**: all writes happen in the caller-supplied transaction.
- **Idempotent**: re-running with the same `effectiveTo` is a no-op (items already cancelled fail the `status='active'` filter).
- **Dry-run-first**: callers always preview before committing.

---

## 4. Scenario 1 — Student leaves / TC mid-year

### 4.1 Endpoints

```
POST /api/school/students/[id]/withdraw/preview
POST /api/school/students/[id]/withdraw
```

Body shape (both):

```json
{
  "effectiveDate": "2026-09-30",
  "reason": "TC",
  "reasonNotes": "Family relocating to Bangalore",
  "refundEligible": true
}
```

### 4.2 Flow

1. Authorise: `SCHOOL_ADMIN` or `students:withdraw` permission. Backdated `effectiveDate` requires `SCHOOL_ADMIN`.
2. Validate: student exists, not already withdrawn for this academic year (idempotency check on `StudentWithdrawal.@@unique([studentId, academicYear])`).
3. Inside one `$transaction`:
   - For each active `StudentFeeAssignment` in current AY:
     - `applyAssignmentWindow({ scope: 'academic', assignmentId, effectiveTo: effectiveDate, reason: 'STUDENT_WITHDRAWN', dryRun })`
   - For each active `TransportAllocation` in current AY:
     - `applyAssignmentWindow({ scope: 'transport', allocationId, effectiveTo: effectiveDate, reason: 'STUDENT_WITHDRAWN', dryRun })`
     - Insert `TransportEvent` with `eventType='WITHDRAWN', cascadeFromWithdrawal=true`.
   - If not dry-run:
     - Insert `StudentWithdrawal` row with aggregated `cancelledItemsJson`, `cancelledAmount`, `totalRefundDue`.
     - Set `Student.deletedAt = effectiveDate` *only* if `effectiveDate <= today` (otherwise schedule for that date — out of scope for v1).
     - Write `FeeAuditLog`.
4. Return aggregated result for the UI:
   ```json
   {
     "academic": { "cancelledAmount": 24000, "cancelledItems": [...], "skippedDueToAllocations": [...] },
     "transport": { "cancelledAmount": 6000, "cancelledItems": [...], "skippedDueToAllocations": [...] },
     "totalCancelled": 30000,
     "totalRefundDue": 12500
   }
   ```

### 4.3 Reversal

`POST /api/school/students/[id]/withdraw/reverse` within `TC_REVERSAL_WINDOW_DAYS` (env, default 7). Reverses the `StudentWithdrawal` row (`reversedAt`, `reversedBy`, `reversalNotes`); does **not** auto-restore the cancelled items — that requires a fresh fee assignment/allocation if the student rejoins.

---

## 5. Scenario 2 — Student adds transport mid-year

### 5.1 Endpoints

```
POST /api/school/students/[id]/transport/preview
POST /api/school/students/[id]/transport
```

Body:

```json
{
  "routeId": "...",
  "stop": "Lajpat Nagar",
  "effectiveFrom": "2026-10-15"
}
```

### 5.2 Flow

1. Authorise: `SCHOOL_ADMIN` or `transport:manage`.
2. Validate: student exists, no `TransportAllocation` currently `isActive=true` for this AY (must withdraw first if changing).
3. Resolve fare: `TransportStopFare` for `(routeId, stop, academicYear)`. Reject if not found.
4. Compute eligible months: same pro-rate logic as admission — months whose calendar month is ≥ `effectiveFrom`'s month.
5. Inside `$transaction`:
   - Create `TransportAllocation` with:
     - `effectiveFrom` (from request)
     - `effectiveTo = null`
     - `isActive = true`
     - `changeReason = 'INITIAL'` (or `'REJOIN'` if a previously withdrawn allocation exists for this student/AY — link via `previousAllocationId`)
     - `feeMonths` = eligible months (JSON array)
   - For each eligible month, create `FeeCollection` + DEBIT `StudentFeeLedgerEntry` (existing pattern).
   - Insert `TransportEvent` (`eventType='CREATED'` or `'REJOINED'`).
   - Update `Admission.transportRouteId / transportStop` to reflect current snapshot.

### 5.3 Why a separate endpoint (not just admission PATCH)

The existing `PATCH /api/school/students/[id]` only updates `Admission` fields (line 678) — it does not create transport allocations or fee debits. Bolting fee-aware logic onto that generic PATCH risks regressions for unrelated edits. A dedicated endpoint keeps the contract narrow and gives a place to attach the preview + dry-run safety.

---

## 6. Scenario 3 — Student discontinues transport mid-year

### 6.1 Endpoints

```
POST /api/school/students/[id]/transport/withdraw/preview
POST /api/school/students/[id]/transport/withdraw
```

Body:

```json
{
  "effectiveDate": "2026-12-15",
  "reason": "Family bought a car",
  "reasonNotes": null
}
```

### 6.2 Flow

1. Authorise: `SCHOOL_ADMIN` or `transport:manage`. Backdated requires `SCHOOL_ADMIN`.
2. Validate: an active `TransportAllocation` exists for this student in current AY. Reject otherwise.
3. Inside `$transaction`:
   - `applyAssignmentWindow({ scope: 'transport', allocationId, effectiveTo: effectiveDate, reason: 'WITHDRAWN', dryRun })`
   - If not dry-run, set `TransportAllocation.effectiveTo = effectiveDate, isActive = false, changeReason = 'WITHDRAWN', withdrawnBy, withdrawalNotes`.
   - Insert `TransportEvent` with `eventType='WITHDRAWN', cascadeFromWithdrawal=false`.
4. Return the standard `WindowChangeResult`.

---

## 7. Complete API surface

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/school/students/[id]/withdraw/preview` | Dry-run TC impact |
| POST | `/api/school/students/[id]/withdraw` | Issue TC |
| POST | `/api/school/students/[id]/withdraw/reverse` | Reverse erroneous TC within window |
| POST | `/api/school/students/[id]/transport/preview` | Dry-run mid-year transport add |
| POST | `/api/school/students/[id]/transport` | Add transport mid-year |
| POST | `/api/school/students/[id]/transport/withdraw/preview` | Dry-run transport drop |
| POST | `/api/school/students/[id]/transport/withdraw` | Drop transport mid-year |
| GET | `/api/school/students/[id]/transport/history` | Timeline of `TransportEvent` rows |
| GET | `/api/school/students/[id]/withdrawal-status` | Read current `StudentWithdrawal` if any |

Authorisation summary:

| Action | Default permission | Backdated override |
|---|---|---|
| TC issuance | `students:withdraw` OR SCHOOL_ADMIN | SCHOOL_ADMIN only |
| Transport add | `transport:manage` OR SCHOOL_ADMIN | SCHOOL_ADMIN only |
| Transport drop | `transport:manage` OR SCHOOL_ADMIN | SCHOOL_ADMIN only |
| TC reversal | SCHOOL_ADMIN only | n/a |

---

## 8. Shared UX flow

The same dialog pattern fits all three scenarios:

```
┌── Issue TC for [Student Name] ──────────────────┐
│                                                  │
│  Effective date: [____________]    (date picker) │
│  Reason:         [▼ Transfer Certificate]        │
│  Notes:          [________________________]      │
│  Refund eligible: ☐                              │
│                                                  │
│  ── Impact preview ────────────────────────      │
│  Academic fees that will be cancelled:           │
│    • Tuition (Oct-Mar)         ₹12,000           │
│    • Annual Lab Fee              ₹2,000          │
│  Transport fees that will be cancelled:          │
│    • Transport (Oct-Mar)        ₹6,000           │
│  Total cancelled:               ₹20,000          │
│                                                  │
│  ⚠ Already-paid items (manual refund needed):    │
│    • Sep Tuition  paid ₹2,000  — refund?         │
│  Total refund due:              ₹2,000           │
│                                                  │
│       [Cancel]            [Issue TC]             │
└──────────────────────────────────────────────────┘
```

The "Impact preview" panel calls the corresponding `/preview` endpoint on every change of effective date. Final button posts to the live endpoint.

Profile page additions:

- Student profile: a "Withdrawal status" panel showing `StudentWithdrawal` row + a reverse button (within window).
- Transport section: timeline view of `TransportEvent` rows for the AY.

---

## 9. Concurrency, idempotency, race-safety

- **`StudentWithdrawal.@@unique([studentId, academicYear])`** prevents two cashiers from issuing TC simultaneously — second request gets P2002, surface as "Already withdrawn".
- **`TransportAllocation`** — no DB constraint enforces "one active allocation per (student, AY)". Enforce at application level inside the transaction by re-checking `isActive=true` count immediately before creation. Add a partial unique index in a future migration (`WHERE isActive = true`).
- **Backdated edits** allowed but logged in audit + restricted to SCHOOL_ADMIN.
- **Preview is read-only**, so multiple concurrent previews don't conflict.

---

## 10. Refund handling (stub)

This design **identifies** refund-due amounts but does not **issue** them. Reasoning: schools want a human in the loop for refunds (bank details, mode, approval), and the existing ledger's `REFUND` entry type is unused — building it properly is a separate feature.

What this design does provide:

- The `totalRefundDue` field on `StudentWithdrawal` records what the school owes the parent.
- The `skippedDueToAllocations` list in the response shows which paid items are eligible for refund.
- The audit log preserves the data needed for a manual refund workflow built later.

Future work: a `POST /api/school/students/[id]/refund` endpoint that creates `entryType='REFUND'` ledger entries and a `RefundPayment` table for tracking outgoing money.

---

## 11. Audit trail

Every operation writes **three** records:

1. **Domain row** — `StudentWithdrawal` or `TransportEvent`.
2. **`FeeAuditLog`** entry with `entityType / entityId / newValue` containing the full JSON of cancelled + skipped items.
3. **Snapshot update** — assignment's `snapshotJson` gets a `closedAt`, `closureReason`, `cancelledItemIds` field appended.

This redundancy is deliberate: any single table loss still leaves a reconstructable history.

---

## 12. Env knobs (deployable per-school via env)

```env
TC_REVERSAL_WINDOW_DAYS=7
WITHDRAWAL_CASCADE_LIMIT=20
BILLING_WINDOW_DRY_RUN_TIMEOUT_MS=10000
```

---

## 13. Migration plan (phased rollout)

### Phase 0 — Schema + backfill

- `prisma db push` with the new columns and tables.
- Run `scripts/backfill-transport-windows.ts --dry-run` then `--apply`.
- Risk: zero (additive only). Old code keeps working since all new columns are nullable.

### Phase 1 — Backend

- `src/lib/billing-window.ts` — core helper (no UI yet).
- The seven new API endpoints.
- Unit tests for `applyAssignmentWindow` covering: empty assignment, all-skipped (paid) items, mixed, transport, dry-run.
- Risk: low — endpoints are net-new, no existing route touched.

### Phase 2 — Frontend

- Student profile page: action buttons, dialog with effective-date picker + reason + live preview, history timeline.
- Withdrawal banner on profile if `StudentWithdrawal` exists.
- Risk: medium — depends on existing profile page structure. Land behind a feature flag (`NEXT_PUBLIC_ENABLE_BILLING_WINDOW_UI`) until smoke-tested.

### Phase 3 — Cleanup / hardening

- Add the partial unique index on `TransportAllocation` for `(studentId, academicYear) WHERE isActive=true`.
- Refactor the existing `PATCH /api/school/students/[id]` to redirect transport intent into the new endpoints (instead of silently dropping it on the floor).
- Risk: low — internal refactor.

### Phase 4 — Refund integration (optional follow-up)

- Wire the `REFUND` ledger entry type.
- Refund UI on student profile.

---

## 14. Notable sharp edges

1. **The pro-rate clamp** (`assignStudentFeesFromStructure` setting `dueDate = max(structureDueDate, effectiveFrom)`) stays. The new window-close helper operates on stored dueDates only — it doesn't re-derive them. So a TC after a late admission cancels the items past `effectiveTo` correctly.
2. **`TransportAllocation` had only `isActive`** — keep it for fast filtering but enforce the invariant `isActive = (effectiveTo IS NULL OR effectiveTo > now())`. Both fields must be updated atomically.
3. **Cascade order matters** — `TransportEvent` must be inserted *after* the allocation update so the FK to `toAllocationId` is non-null. Reverse for change/withdraw events that reference `fromAllocationId`.
4. **Student deletion vs withdrawal** — `Student.deletedAt` should only be set when the student is administratively removed. Withdrawal alone keeps the student record discoverable for transcripts, alumni lookup, etc. Withdrawal flips no Student column; it just inserts a `StudentWithdrawal` row.
5. **Demand-slip generator** — `selectDueAssignmentItems` already reads `assignment.effectiveFrom`. Add a parallel check against `assignment.effectiveTo` so post-withdrawal months never get auto-generated.
6. **Idempotent re-runs** — repeating a TC POST for the same `(student, AY)` returns the existing `StudentWithdrawal` row and a no-op `WindowChangeResult`. No P2002 surfaced as 500.
7. **Print-friendly TC document** — generating a transfer-certificate PDF is out of scope here. The data captured in `StudentWithdrawal` + the snapshot is enough to drive that later.
8. **Refundable deposits** — `FeesHead.headType='REFUNDABLE_DEPOSIT'` already exists. The withdrawal flow should auto-mark refundable-deposit items as "refund-eligible" rather than just cancelling them. Track in `cancelledItemsJson` with a flag per item.
9. **Mid-month dates** — pro-rata daily is the locked decision from the paused project. For per-day fee calculation, use `(daysAttended / daysInMonth) * monthlyAmount`. Defer implementation; current month's full charge applies until daily-pro-rata UI is added.

---

## 15. File index (what gets touched)

**New files**

- `prisma/schema.prisma` — additions to `TransportAllocation`, new `StudentWithdrawal`, `TransportEvent`
- `src/lib/billing-window.ts` — core helper
- `src/app/api/school/students/[id]/withdraw/route.ts` — POST + preview
- `src/app/api/school/students/[id]/withdraw/reverse/route.ts` — POST
- `src/app/api/school/students/[id]/transport/route.ts` — POST + preview (mid-year add)
- `src/app/api/school/students/[id]/transport/withdraw/route.ts` — POST + preview (drop)
- `src/app/api/school/students/[id]/transport/history/route.ts` — GET timeline
- `src/app/api/school/students/[id]/withdrawal-status/route.ts` — GET status
- `scripts/backfill-transport-windows.ts` — one-shot backfill
- `src/features/students/components/withdrawal-dialog.tsx` — TC UI
- `src/features/students/components/transport-add-dialog.tsx` — add UI
- `src/features/students/components/transport-withdraw-dialog.tsx` — drop UI
- `src/features/students/components/transport-history-timeline.tsx` — read-only timeline

**Modified files**

- `src/lib/fee-demand.ts` — `selectDueAssignmentItems` adds `effectiveTo` guard
- `src/app/api/school/students/[id]/route.ts` — redirect transport-intent edits to the new endpoints
- `src/features/students/pages/student-profile-page.tsx` — wire new dialogs + status banner
- `developer-documentation/fees-creation-assignment-collection-flow.md` — add cross-links

---

## 16. Related

- [[fees-creation-assignment-collection-flow]] — the OPEN side of the window
- [[transport-module-flow]] — transport assignment fundamentals
- [[admission-flow]] — original window opener
- Paused project memory: `project_transport_withdrawal_pending` — Phase 1 schema was already approved there; this design supersedes it with the academic-fee cascade and a unified helper
