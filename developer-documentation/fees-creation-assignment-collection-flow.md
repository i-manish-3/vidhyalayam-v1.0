# Fees Module — Creation, Assignment & Collection Flow

This document covers the three core flows of the Fees module:

1. **Fee Creation** — admin sets up the catalogue and price templates.
2. **Fee Assignment** — a student is linked to a structure and starts owing money.
3. **Fee Collection** — money comes in, the ledger allocates it across dues.

Demand-slip generation and WhatsApp distribution are out of scope here — see `fees-module-flow.md` / the demand-slip code paths for those.

The cardinal rule of the schema:

> `FeesStructure` is a reusable class-level template.
> `StudentFeeAssignment` is a per-student snapshot frozen at assignment time.
> The `StudentFeeLedgerEntry` table is the authoritative record of money owed and paid.
> `FeeCollection` is the legacy mirror, kept in sync for backward-compatible reads.

---

## 1. Fee Creation (setup pipeline)

Three layers, built bottom-up. None of these touch any student — they are catalogue/template definitions only.

### 1.1 `FeesHead` — catalogue of fee types

**Purpose:** the master list of charges (Tuition, Transport, Library, Exam, Admission, Caution Money…). One row per fee type per school.

**Schema** (`prisma/schema.prisma:800`)

```prisma
model FeesHead {
  id            String   @id @default(cuid())
  schoolId      String
  name          String
  frequency     String   // ONE_TIME | MONTHLY | QUARTERLY | HALF_YEARLY |
                         // YEARLY | INSTALLMENT | ON_DEMAND | CUSTOM
  headType      String   @default("STANDARD")
                         // STANDARD | REFUNDABLE_DEPOSIT | NON_REFUNDABLE
  isOptional    Boolean  @default(false)
  applicability String?  // JSON rules for gender/category/student type
                         // (stored, NOT YET READ by any consumer)
  isActive      Boolean  @default(true)
  // ... timestamps + soft-delete

  @@unique([schoolId, name])
}
```

**API** (`src/app/api/school/fees/heads/route.ts`)

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| `GET` | `/api/school/fees/heads` | role: SCHOOL_ADMIN/TEACHER/STAFF | Lists non-deleted heads ordered by name |
| `POST` | `/api/school/fees/heads` | `fees:create` | Validates `frequency` against the 8-value enum (line 44) and `headType` against 3 values (line 49) |
| `PATCH` | `/api/school/fees/heads/[id]` | `fees:update` | Update name/frequency/headType/isOptional/isActive |

**POST body shape**

```json
{
  "name": "Tuition",
  "frequency": "MONTHLY",
  "headType": "STANDARD",
  "isOptional": false,
  "isActive": true,
  "applicability": null
}
```

**Important notes**
- `frequency` becomes `billingBehavior` on the per-student assignment item and drives demand-slip selection later (`MONTHLY` ⇒ picked every month).
- `applicability` is `JSON.stringify`-ed and stored, but **no code path currently reads it** — it is a half-finished extension point for gender/category-aware fees.
- No delete endpoint in the UI (`fees-heads-page.tsx`), only an `isActive` toggle.

---

### 1.2 `FeesGroup` — bundle of heads

**Purpose:** a reusable bundle of fee heads (e.g. _Day-scholar Group_ = Tuition + Library + Exam; _Boarder Group_ = same + Hostel + Mess). Lets admins assemble several pricing variants from the same head catalogue.

**Schema** (`prisma/schema.prisma:822`)

```prisma
model FeesGroup {
  id          String   @id @default(cuid())
  schoolId    String
  name        String
  description String?
  isActive    Boolean  @default(true)
  // ... soft-delete

  items       FeesGroupItem[]
  structures  FeesStructure[]
  assignments StudentFeeAssignment[]

  @@unique([schoolId, name])
}

model FeesGroupItem {
  id        String @id @default(cuid())
  groupId   String
  feeHeadId String

  @@unique([groupId, feeHeadId])
}
```

**API** (`src/app/api/school/fees/groups/route.ts`)

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| `GET` | `/api/school/fees/groups?classId&academicYear` | role-based | When both `classId` and `academicYear` are present, restricts results to groups that have an active `FeesStructure` for that key (lines 43–63). Used by admission/promotion UIs |
| `POST` | `/api/school/fees/groups` | `fees:create` | Body: `{ name, description, feeHeadIds[] }`. Verifies all head IDs belong to the same school |
| `PATCH` | `/api/school/fees/groups/[id]` | `fees:update` | `_DEFAULT` cannot be renamed |
| `DELETE` | `/api/school/fees/groups/[id]` | `fees:delete` | Soft-delete only if not used by structures/assignments; `_DEFAULT` cannot be deleted |

**The `_DEFAULT` group**
- Lazily created on first `GET` via `ensureDefaultFeeGroup` (`route.ts:9-29`).
- Always sorted to the top of the list (line 75).
- Protected from rename + delete.
- Acts as the safety-net group used by admission/promotion when no explicit group is picked.

---

### 1.3 `FeesStructure` + `FeesStructureItem` — actual price list

**Purpose:** the price tag. A structure says: _"For Class 5, Section A, AY 2025–26, using the Day-scholar group, here are the installment amounts and due dates."_

**Schema** (`prisma/schema.prisma:854`)

```prisma
model FeesStructure {
  id            String    @id @default(cuid())
  schoolId      String
  feesGroupId   String
  classId       String
  sectionId     String?   // null = whole class (covers all sections)
  academicYear  String
  name          String
  version       Int       @default(1)   // increments on replace
  status        String    @default("active")  // draft | active | archived
  effectiveFrom DateTime?
  effectiveTo   DateTime?
  lockedAt      DateTime?
  lockedBy      String?
  isActive      Boolean   @default(true)
  // ... timestamps + soft-delete
}

model FeesStructureItem {
  id              String    @id @default(cuid())
  feeStructureId  String
  feeHeadId       String
  installmentName String    // "Apr", "May", "Q1", "Term-1", "Annual"...
  amount          Float     @default(0)
  dueDate         DateTime?
  lateFee         Float     @default(0)
  frequency       String    // copied from FeesHead at creation
}
```

**API** (`src/app/api/school/fees/structures/route.ts`)

| Method | Endpoint | Permission |
|---|---|---|
| `GET` | `/api/school/fees/structures?classId&academicYear&feesGroupId` | role-based |
| `POST` | `/api/school/fees/structures` | `fees:create` |

**POST body shape**

```json
{
  "name": "Class 5 — Day Scholar 2025-26",
  "feesGroupId": "cuid...",
  "classId": "cuid...",
  "sectionId": null,
  "academicYear": "2025-2026",
  "effectiveFrom": "2025-04-01",
  "effectiveTo": null,
  "version": null,
  "replaceExisting": true,
  "items": [
    {
      "feeHeadId": "cuid...",
      "installmentName": "Apr",
      "amount": 4500,
      "dueDate": "2025-04-10",
      "lateFee": 100,
      "frequency": "MONTHLY"
    }
  ]
}
```

**Key behaviours**

| Behaviour | Where | What it does |
|---|---|---|
| Section "ALL" normalisation | line 109 | `'ALL'` or empty → stored as `null` (whole-class structure) |
| Auto-version | line 122–124 | Looks up `max(version)` for `(school, group, class, section, year)` and increments. Client can override with explicit `version` |
| Replace existing | line 126–142 | When `replaceExisting=true`, archives all currently-active structures with same key: `status='archived', isActive=false`. Soft-archive — rows remain so historical assignments still resolve |
| Frequency fallback | line 175 | If client omits `frequency` on an item, copies from the linked `FeesHead` via the group's items |

**Why versions matter:** every `StudentFeeAssignment` is anchored to a specific structure version and freezes the prices into its own `snapshotJson`. When you "republish" a structure mid-year for new admissions, existing students keep paying off their original prices.

**UI** (`src/features/fees/pages/fees-structures-page.tsx`, ~1715 lines) is a wizard that lets the admin select multiple classes at once, toggle fee heads on/off per class, copy one amount across all rows, or auto-fill due dates across months. Internally it fires the POST once per class with `replaceExisting=true`.

---

## 2. Fee Assignment (student gets billed)

This is the bridge: a `FeesStructure` is just a template; once a student is linked to it via `StudentFeeAssignment`, they actually owe money.

### 2.1 The single entry point: `assignStudentFeesFromStructure`

Location: `src/lib/fees.ts:637`. Every code path that bills a student goes through this function.

**Signature**

```ts
assignStudentFeesFromStructure({
  tx,                 // Prisma transaction client — ALWAYS called inside $transaction
  schoolId,
  studentId,
  classId,            // student's current class
  sectionId,          // student's current section (null = match whole-class structure)
  feesGroupId,        // which group to bill them under
  academicYear,
  assignedBy,         // userId for audit
  source,             // 'admission' | 'promotion' | 'manual' | 'migration'
  effectiveFrom,
})
```

**What it does, step by step**

1. **Resolve the structure** (lines 653–686). Finds active structures matching school+class+group+year. Picks the one with `sectionId === studentSectionId` first; falls back to the section-null (whole-class) structure. Returns `null` silently and exits if no match — the student gets no fees set up. **The admission route does not fail in this case**, so it is possible to onboard a student with no fees at all.
2. **Idempotency check** (lines 689–699). If a `StudentFeeAssignment` already exists for `(studentId, feeStructureId, academicYear)` (the schema's `@@unique`), returns the existing one and does nothing. Safe to call twice.
3. **Create assignment + snapshot** (lines 701–738).
   - One `StudentFeeAssignment` row.
   - `snapshotJson` freezes the structure + items at creation time (lines 714–736). If an admin later changes the structure, this student keeps the original prices.
4. **Create assignment items** (lines 753–770). One `StudentFeeAssignmentItem` per `FeesStructureItem` — denormalized copies of `amount, dueDate, installmentName, billingBehavior (=frequency), headType, isOptional, lateFee`. Status defaults to `'active'`. **Demand-slip and collection code reads this, not the structure.**
5. **Create the opening invoice** (lines 772–785). One `StudentFeeInvoice` with `isMonthlyDemand=false`, holding the whole year's items in one document. `dueDate` = earliest item due date. `subtotal = totalAmount = sum(items.amount)`. No previous balance, no discounts.
6. **Create invoice lines** (lines 787–800). One `StudentFeeInvoiceLine` per item, linked to its `assignmentItemId`.
7. **Create FeeCollection rows** (lines 802–823). For each item: legacy `FeeCollection` with `paymentStatus='unpaid'`. This duplicates state but is required because older UIs and reports read from `FeeCollection`. Every new write path must keep both in sync.
8. **Create DEBIT ledger entries** (lines 825–845). For each item, `createFeeDebitLedgerEntry`:
   - `entryType='DEBIT'`, `sourceType='assignment'`, `sourceId=assignmentItemId`
   - `debit=amount, balanceAmount=amount, status='open'`
   - Linked simultaneously to invoice, invoiceLine, feeCollection, assignmentItem (multi-rail linkage is intentional — payment can later be allocated via any of these IDs).
9. **Audit log** (lines 847–862). One `FeeAuditLog` row with the summary.

All nine steps execute inside one Prisma transaction. If any step fails, none of it persists.

### 2.2 Who calls it

| Trigger | File:line | `source` value |
|---|---|---|
| Admission creation | `src/app/api/school/admissions/route.ts:840` | `'admission'` |
| Single student promotion | `src/app/api/school/students/promote/route.ts:361` | `'promotion'` |
| Bulk promotion | `src/app/api/school/students/promote/route.ts:273` | `'promotion'` |
| Bulk admission commit | `src/app/api/school/admissions/bulk/commit/route.ts` | `'admission'` |

**There is currently no UI to manually assign fees mid-year.** To add an existing student to a structure outside the admission/promotion flow, a new admin endpoint must call this function with `source='manual'`.

### 2.3 Transport fees

Transport is **not** modelled as a `FeesStructure` — it is bolted onto the admission/promotion routes. Those routes create `TransportAllocation` + `FeeCollection` + DEBIT ledger entries inline for each month of transport fare. There is no `assignTransportFees` helper. Transport carry-forward during promotion always uses the **new year's** `TransportStopFare` — old fare is never copied.

### 2.4 Legacy-data backfill: `ensureLedgerForExistingCollections`

Location: `src/app/api/school/fees/collections/route.ts:44-121`.

Called by both `GET` and `POST` of `/api/school/fees/collections`. Finds any `FeeCollection` rows that have no DEBIT ledger entries yet (the `ledgerEntries: { none: ... }` filter, line 54), and backfills DEBIT ledger entries for them. Carried balance is computed as `amount + fine − paid − discount − concession − scholarship`. Capped at 500 collections per call (line 72).

This is the **lazy migration helper** — older data and seeded data work with the ledger-first UI without a manual migration step. The downside is that it runs on every collections list/POST call. It is idempotent (after the first hit, the `none` filter excludes the now-ledgered rows), but slow on first contact.

### 2.5 Changing fee group mid-year

`PATCH /api/school/fees/assignments/[id]/change-group` exists for "wrong group picked at admission" recovery, but is **guarded to assignments with zero payments recorded**. It cancels the old assignment + opening invoice and re-calls `assignStudentFeesFromStructure` with the new group. Once any payment is made, this endpoint refuses — a deliberate safety lock.

---

## 3. Fee Collection (money in)

This is where the ledger does the heavy lifting. Two layers: the HTTP endpoint shape that the cashier UI hits, and the allocation engine inside `recordStudentLedgerPayment`.

### 3.1 The endpoint: `POST /api/school/fees/collections`

Location: `src/app/api/school/fees/collections/route.ts:379`. Accepts **two shapes**.

#### Modern multi-row shape (UI uses this)

```json
{
  "studentId": "cuid...",
  "payments": [
    { "ledgerEntryId": "cuid...", "amount": 4500, "discount": 0 },
    { "ledgerEntryId": "cuid...", "amount": 1200, "discount": 200 }
  ],
  "paymentMethod": "CASH",
  "transactionRef": null,
  "paymentDate": "2026-05-29",
  "receiptNumber": null,
  "notes": "May fees + transport"
}
```

**What happens** (lines 419–505):

1. `ensureLedgerForExistingCollections` runs (line 415) to backfill legacy collections for this student if needed.
2. Inside one `$transaction`:
   - Generate the sequential receipt number via `nextSequentialReceiptNumber` (`fees.ts:119`) — walks `studentFeePayment.findMany`, parses each `receiptNumber` as int, returns `max + 1`. Race-prone under concurrent collections; protected only by `@@unique([schoolId, receiptNumber])` which throws `P2002` — **there is no retry**.
   - Build `targets[]` from `payments`. Each target points at a debit by `ledgerEntryId` (preferred) or `feeCollectionId` (fallback), plus an amount.
   - If `totalPaid > 0`: call `recordStudentLedgerPayment` with all targets at once.
   - If any `discount > 0`: call `recordStudentLedgerWaiver` with `sourceType='discount'` and discount targets.
   - Write one `FeeAuditLog` row with `action='ledger_payment_recorded'`.

#### Legacy single-row shape

```json
{
  "studentId": "cuid...",
  "ledgerEntryId": "cuid...",
  "paidAmount": 4500,
  "discount": 100,
  "concession": 0,
  "scholarship": 0,
  "paymentMethod": "CASH"
}
```

Lines 507–585. Same engine but only one target. Three separate `recordStudentLedgerWaiver` calls (one per kind: `discount`, `concession`, `scholarship`).

### 3.2 The allocation engine: `recordStudentLedgerPayment` → `applyLedgerCredit`

`src/lib/fees.ts:544` calls `applyLedgerCredit` at `src/lib/fees.ts:387`. **This is the most safety-critical part of the module.**

**Step-by-step inside `applyLedgerCredit`:**

1. **Create the CREDIT row** (lines 414–436). A `StudentFeeLedgerEntry` with:
   - `entryType='CREDIT'`
   - `sourceType='payment'`, `sourceId=paymentId`
   - `credit=amount, balanceAmount=amount` (unallocated initially)
   - `status='open'`
2. **Resolve target debits** (lines 443–482):
   - If the caller passed `targets[]`, each target is looked up explicitly. Only DEBITs that are still `open|partial` with `balanceAmount > 0` qualify. The result is `orderedDebits` in caller-specified order.
   - If no targets, fall back to **all open debits for the student**, ordered by `dueDate ASC, createdAt ASC` (line 479) — the implicit _"oldest dues first"_ rule.
3. **Walk debits, create allocations** (lines 484–526):
   - For each debit: `applied = min(remaining credit, debit.balanceAmount, target.requestedAmount)`.
   - Create a `StudentFeeLedgerAllocation` row linking this credit ↔ this debit with `amount=applied`.
   - Update the debit: `balanceAmount -= applied`, recompute `status` (`settled` / `partial` / `open`).
   - Call `syncLegacyCollectionFromDebit` (line 301) to mirror onto the legacy `FeeCollection.paidAmount/paymentStatus` and update the linked `StudentFeeInvoiceLine.status`.
   - Track touched invoice IDs in a `Set`.
   - Decrement `remaining`. Stop when zero.
4. **Update the CREDIT row's balance** (lines 528–535). `balanceAmount = credit − applied`. Status becomes `settled` (fully allocated), `partial`, or `open` (nothing applied — sits as an unallocated credit, effectively an advance payment).
5. **Re-sync touched invoices** (lines 537–539). For each invoice ID in the Set, `syncInvoiceFromLedger` (line 239) rebuilds the invoice's `paidAmount, discount, concession, scholarship, status` from the sum of its allocations. **Invoice totals are derived, never directly written.**

### 3.3 Waivers — discount, concession, scholarship

`recordStudentLedgerWaiver` (`src/lib/fees.ts:606`) is just `applyLedgerCredit` with `entryType='WAIVER'` and `sourceType` ∈ `{discount, concession, scholarship}`. Same allocation logic, but **no `StudentFeePayment` row is created** (waivers aren't real money in). The mirroring helper `syncLegacyCollectionFromDebit` detects `WAIVER` vs `CREDIT` (lines 342–353) and routes the amount onto the right column of the legacy collection row.

### 3.4 What the cashier UI shows: `GET /api/school/fees/collections`

`src/app/api/school/fees/collections/route.ts:124`. With `?studentId=X`, returns a denormalized view fused from four sources:

| Returned field | Source |
|---|---|
| `collections[]` | All DEBIT entries for the student. Each row carries `balanceAmount`, derived `status` (PAID/PARTIAL/UNPAID), and joins `feeCollection` so legacy fields (discount, fine, paymentMethod) flow through |
| `receiptHistory[]` | All CREDIT entries with a `receiptNumber`. Walks allocations to compute per-receipt feePeriods/transportPeriods/discount/dues totals |
| `transportInfo` | The active `TransportAllocation` for the student (route, stop, fare) |
| `pagination` | Page/limit on the debit query |

Notable: lines 320–323 — for the _"dues remaining as of this receipt date"_ column in receipt history, the code walks **other allocations** on the same debits that happened **later** than this credit, adds their amounts back. That is how the historical balance for an old printed receipt is reconstructed.

### 3.5 Cashier UI flow

File: `src/features/fees/pages/fee-collections-page.tsx` (~2156 lines).

1. Search student → pick one (or arrive via `?preselect=studentId`).
2. UI fetches `GET /api/school/fees/collections?studentId=X&academicYear=Y` and groups items into four tabs:
   - Current-AY monthly items up to current month
   - Other term items (non-monthly: admission, exam, registration)
   - Previous-AY dues (arrears)
   - Transport
3. On load: previous-AY dues + current-AY monthly months-to-date are pre-ticked. Cashier can override freely.
4. Cashier enters discount, picks method (CASH/ONLINE/CHEQUE/UPI). Can split across methods (first row auto-syncs to total unless manually edited).
5. UI sends `POST` with `payments: [{ ledgerEntryId, amount, discount }, ...]`.
6. UI re-fetches and shows the updated history table + a print-ready receipt with amount-in-words.

---

## 4. Mental model — single-page diagram

```
┌──────────────── SETUP (per school) ──────────────────┐
│                                                       │
│  FeesHead ──┐                                         │
│             ├─→ FeesGroup (bundle of heads)           │
│  FeesHead ──┘                                         │
│                       │                               │
│                       ▼                               │
│  FeesStructure (per class+section+AY+group, versioned)│
│                       │                               │
│                       ▼                               │
│  FeesStructureItem (installments with amount+dueDate) │
└───────────────────────┬───────────────────────────────┘
                        │
            ┌───────────┴────────────┐
            │ assignStudentFeesFrom  │
            │ Structure              │
            │ (admission / promotion)│
            └───────────┬────────────┘
                        ▼
┌──────────── PER STUDENT (one transaction) ───────────┐
│                                                       │
│  StudentFeeAssignment (snapshotJson freezes prices)   │
│           │                                           │
│           ▼                                           │
│  StudentFeeAssignmentItem × N                         │
│  (active | billed | waived | cancelled)               │
│           │                                           │
│           ├─→ StudentFeeInvoice (opening,             │
│           │   isMonthlyDemand=false)                  │
│           │      └─→ StudentFeeInvoiceLine × N        │
│           │                                           │
│           ├─→ FeeCollection × N (legacy mirror)       │
│           │                                           │
│           └─→ StudentFeeLedgerEntry × N (DEBIT,       │
│               balanceAmount=amount, status=open)      │
│                                                       │
└───────────────────────┬───────────────────────────────┘
                        ▼
┌────────────── COLLECTION (cashier) ───────────────────┐
│                                                       │
│  POST /api/school/fees/collections with payments[]    │
│           │                                           │
│           ▼                                           │
│  StudentFeePayment (receipt header, seq #)            │
│           │                                           │
│           ▼                                           │
│  StudentFeeLedgerEntry (CREDIT,                       │
│  balanceAmount=amount, status=open)                   │
│           │                                           │
│           ▼  allocation engine                        │
│           │  (caller targets, else FIFO by dueDate)   │
│           ▼                                           │
│  StudentFeeLedgerAllocation rows linking              │
│  CREDIT ↔ DEBITs                                      │
│           │                                           │
│           ├─→ DEBIT.balanceAmount/status updated      │
│           ├─→ FeeCollection.paidAmount/status synced  │
│           └─→ Invoice totals re-derived from          │
│               allocations (syncInvoiceFromLedger)     │
│                                                       │
│  Waivers (discount/concession/scholarship)            │
│   ↳ same engine, entryType=WAIVER,                    │
│      no StudentFeePayment row                         │
└───────────────────────────────────────────────────────┘
```

---

## 5. Notable sharp edges (read before enhancing)

1. **`applicability` on FeesHead is stored but unread.** Half-finished extension point for gender/category-aware fees.
2. **No manual mid-year assignment endpoint.** Adding fees to an existing student outside admission/promotion needs new code calling `assignStudentFeesFromStructure` with `source='manual'`.
3. **Receipt number race in `nextSequentialReceiptNumber`** (`fees.ts:119`). Uses `findMany().reduce(max) + 1`. Under concurrent collections the `@@unique([schoolId, receiptNumber])` throws `P2002` and the whole request fails with 500 — **no retry wrapper**. The `NumberCounter` model (`schema.prisma:551`) is already used for atomic counters elsewhere and is the right primitive to migrate to.
4. **`ensureLedgerForExistingCollections` runs on every list/POST.** Idempotent but does a full-student scan (up to 500 collections) on first contact. Cheap once collections have ledger entries, but worth knowing if you scale.
5. **Refunds are schema-only.** `entryType='REFUND'` is declared in `prisma/schema.prisma:1131` but **no code path writes one**.
6. **Waivers have no dedicated UI.** They are only created as a side-effect of recording a payment with a non-zero `discount` column. A standalone "approve scholarship" UX requires a new route on top of `recordStudentLedgerWaiver`.
7. **Two write systems coexist** (`FeeCollection` legacy + ledger). Any new write path must call the existing sync helpers (`syncLegacyCollectionFromDebit`, `syncInvoiceFromLedger`) or you will get drift between the two.
8. **No void-receipt / payment-cancellation flow.** Soft-deleting a CREDIT does not re-open the DEBITs it was allocated to — there is no code path that walks allocations back. If you need "void receipt", that is design work.
9. **Transport is special-cased in admission/promotion routes**, not via `assignStudentFeesFromStructure`. Plan changes to those routes carefully.
10. **`status='billed'` on `StudentFeeAssignmentItem`** is set for non-MONTHLY items by demand-slip generation, but the opening invoice from admission does not set it. The demand-slip selector still excludes already-billed lines via a separate filter, so in practice it works — but it is asymmetric and worth knowing if you touch either path.

---

## 6. File index

**Schema**
- `prisma/schema.prisma:800` — `FeesHead`
- `prisma/schema.prisma:822` — `FeesGroup` / `FeesGroupItem`
- `prisma/schema.prisma:854` — `FeesStructure` / `FeesStructureItem`
- `prisma/schema.prisma:906` — `FeeCollection` (legacy)
- `prisma/schema.prisma:946` — `StudentFeeAssignment` / `StudentFeeAssignmentItem`
- `prisma/schema.prisma:1013` — `StudentFeeInvoice` / `StudentFeeInvoiceLine`
- `prisma/schema.prisma:1093` — `StudentFeePayment`
- `prisma/schema.prisma:1120` — `StudentFeeLedgerEntry` / `StudentFeeLedgerAllocation`
- `prisma/schema.prisma:1204` — `FeeAuditLog`

**Core library**
- `src/lib/fees.ts:119` — `nextSequentialReceiptNumber`
- `src/lib/fees.ts:167` — `createFeeDebitLedgerEntry`
- `src/lib/fees.ts:239` — `syncInvoiceFromLedger`
- `src/lib/fees.ts:301` — `syncLegacyCollectionFromDebit`
- `src/lib/fees.ts:387` — `applyLedgerCredit` (allocation engine)
- `src/lib/fees.ts:544` — `recordStudentLedgerPayment`
- `src/lib/fees.ts:606` — `recordStudentLedgerWaiver`
- `src/lib/fees.ts:637` — `assignStudentFeesFromStructure`

**API routes**
- `src/app/api/school/fees/heads/route.ts` — head CRUD
- `src/app/api/school/fees/heads/[id]/route.ts` — head update
- `src/app/api/school/fees/groups/route.ts` — group CRUD + `_DEFAULT`
- `src/app/api/school/fees/groups/[id]/route.ts` — group update/delete
- `src/app/api/school/fees/structures/route.ts` — structure CRUD with versioning
- `src/app/api/school/fees/collections/route.ts` — list dues + record payments
- `src/app/api/school/fees/assignments/[id]/change-group/route.ts` — mid-year group change
- `src/app/api/school/fees/assignments/eligible-for-group-change/route.ts` — list zero-paid assignments

**External callers of `assignStudentFeesFromStructure`**
- `src/app/api/school/admissions/route.ts:840`
- `src/app/api/school/students/promote/route.ts:273` (bulk)
- `src/app/api/school/students/promote/route.ts:361` (single)
- `src/app/api/school/admissions/bulk/commit/route.ts`

**UI**
- `src/features/fees/pages/fees-heads-page.tsx` — head CRUD UI
- `src/features/fees/pages/fees-groups-page.tsx` — group CRUD UI
- `src/features/fees/pages/fees-structures-page.tsx` — structure wizard (~1715 lines)
- `src/features/fees/pages/fee-collections-page.tsx` — cashier collection UI (~2156 lines)
- `src/features/fees/pages/change-fee-group-page.tsx` — change-group UI
