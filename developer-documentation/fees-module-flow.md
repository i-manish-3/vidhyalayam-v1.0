# Fees Module Flow

This document describes the implemented Fees module foundation after Phase 2. The main design rule is:

`FeesStructure` is the reusable class template. `StudentFeeAssignment` is the student-level payable snapshot.

## 1. Current Scope

Implemented through Phase 1:

- Fee heads support richer billing behavior and head metadata.
- Fee structures support version/effective-date fields.
- Admission can create a student fee snapshot when a fee group is selected.
- A manual assignment API can create the same snapshot after admission.
- Snapshot items create demand rows in the existing `FeeCollection` table for backward-compatible collection screens.
- Opening invoice, invoice lines, payment records, and audit logs are now modeled.

Implemented in Phase 2:

- Fee assignment list and manual assignment UI.
- Fee invoice list/detail UI.
- Invoice payment API with allocation across open demand rows.
- Invoice lock, unlock, and cancel API actions.
- Fees sidebar navigation for assignments and invoices.

Existing screens still work with:

- `src/features/fees/pages/fees-heads-page.tsx`
- `src/features/fees/pages/fees-groups-page.tsx`
- `src/features/fees/pages/fees-structures-page.tsx`
- `src/features/fees/pages/fee-assignments-page.tsx`
- `src/features/fees/pages/fee-invoices-page.tsx`
- `src/features/fees/pages/fee-collections-page.tsx`

## 2. Master Data

### 2.1 Fee Head

Model: `FeesHead`

Key fields:

- `name`
- `frequency`: `ONE_TIME`, `MONTHLY`, `QUARTERLY`, `HALF_YEARLY`, `YEARLY`, `CUSTOM`, `INSTALLMENT`, `ON_DEMAND`
- `headType`: `STANDARD`, `REFUNDABLE_DEPOSIT`, `NON_REFUNDABLE`
- `isOptional`
- `applicability`: JSON string for future gender/category/student-type rules

API:

```txt
GET  /api/school/fees/heads
POST /api/school/fees/heads
```

### 2.2 Fee Group

Model: `FeesGroup`

Groups categorize fee structures, such as `New Admission`, `Regular Student`, or `Staff Ward`.

Fee heads can optionally be linked to a group as an allowed-head helper, but the core class fee structure flow still allows selecting from all active fee heads.

API:

```txt
GET  /api/school/fees/groups
POST /api/school/fees/groups
```

### 2.3 Class Fee Structure

Models:

- `FeesStructure`
- `FeesStructureItem`

Fee structure is selected by:

- `academicYear`
- `classId`
- optional `sectionId`
- `feesGroupId`

Creation flow:

1. Select academic year/session, class, optional section, and fee group.
2. The page shows a class-fee-structure table of all active fee heads.
3. User turns on only the heads that should apply to this class/group/session.
4. Expanding a head opens its setup panel.
5. For each selected head, the UI generates amount schedule rows from the head billing behavior:
   - `MONTHLY`: 12 academic-year months from Apr to Mar
   - `QUARTERLY`: 4 quarters
   - `HALF_YEARLY`: 2 half-year periods
   - `YEARLY`: one yearly row
   - `ONE_TIME`: one one-time row
   - `CUSTOM`, `INSTALLMENT`, `ON_DEMAND`: editable custom period rows
6. Only rows with amount greater than zero are saved into `FeesStructureItem`.
7. Updating the same session/class/section/group archives the previous active structure and creates the next active version.

Versioning fields added:

- `version`
- `status`: `draft`, `active`, `archived`
- `effectiveFrom`
- `effectiveTo`
- `lockedAt`
- `lockedBy`

API:

```txt
GET  /api/school/fees/structures
POST /api/school/fees/structures
```

Supported filters:

```txt
classId
academicYear
feesGroupId
```

## 3. Student-Level Snapshot

Model: `StudentFeeAssignment`

This is the durable student payable record. It stores which structure was copied for the student.

Important fields:

- `studentId`
- `feeStructureId`
- `feesGroupId`
- `classId`
- `sectionId`
- `academicYear`
- `source`: `admission`, `promotion`, `manual`, `migration`
- `status`: `active`, `paused`, `closed`
- `effectiveFrom`
- `effectiveTo`
- `snapshotJson`

Snapshot items are stored in:

`StudentFeeAssignmentItem`

Each item copies:

- fee head name
- billing behavior
- installment name
- amount
- due date
- late fee
- head type
- optional flag

This protects already-admitted students from later master changes.

## 4. Admission Integration

File:

`src/app/api/school/admissions/route.ts`

When admission is created and `feesGroupId` is present:

1. The admission and student records are created.
2. `assignStudentFeesFromStructure(...)` finds the active structure for:
   - school
   - student class
   - student section if available, otherwise class-level structure
   - academic year
   - selected fee group
3. The structure is copied into `StudentFeeAssignment`.
4. Each structure item is copied into `StudentFeeAssignmentItem`.
5. One opening `StudentFeeInvoice` is created.
6. Matching `StudentFeeInvoiceLine` rows are created.
7. Existing `FeeCollection` demand rows are created for collection compatibility.
8. A `FeeAuditLog` row is created.

If no active fee structure exists, admission still succeeds and no assignment is created.

## 5. Manual Assignment API

API:

```txt
GET  /api/school/fees/assignments
POST /api/school/fees/assignments
```

Create request:

```json
{
  "studentId": "student_id",
  "feesGroupId": "fees_group_id",
  "academicYear": "2026-2027",
  "effectiveFrom": "2026-04-01"
}
```

The API uses the student's current class and section to find the matching active fee structure.

## 6. Invoice Layer

New invoice tables:

- `StudentFeeInvoice`
- `StudentFeeInvoiceLine`
- `StudentFeePayment`

Invoice APIs:

```txt
GET   /api/school/fees/invoices
PATCH /api/school/fees/invoices/[id]
POST  /api/school/fees/invoices/[id]/payments
```

Invoice list filters:

```txt
studentId
status
academicYear
```

Supported invoice patch actions:

```json
{ "action": "lock" }
{ "action": "unlock" }
{ "action": "cancel" }
```

Cancel rules:

- Only unpaid invoices can be cancelled.
- Cancelling marks the invoice and invoice lines as `cancelled`.
- Linked `FeeCollection` rows are also marked `cancelled`.
- Cancelled invoices cannot receive payments.

Invoice payment request:

```json
{
  "amount": 2500,
  "paymentMethod": "CASH",
  "transactionRef": "optional-reference"
}
```

Payment behavior:

1. Finds open `FeeCollection` demand rows linked to the invoice.
2. Allocates payment from oldest open row to newest.
3. Updates each demand row to `partial` or `paid`.
4. Creates one `StudentFeePayment`.
5. Updates invoice `paidAmount` and `status`.
6. Writes a `FeeAuditLog`.

## 7. Collection Compatibility Layer

Backward-compatible collection table:

- `FeeCollection`

Phase 1 still uses `FeeCollection` as the visible demand/payment surface because the existing collections UI reads from it.

When a snapshot is created:

- One invoice is created for the assignment.
- Invoice lines mirror snapshot items.
- `FeeCollection` rows mirror snapshot items.

When payment is recorded through:

```txt
POST /api/school/fees/collections
```

The API now:

- accepts `structureItemId` as an alias for `feeStructureItemId`
- finds an existing unpaid/partial demand row where possible
- updates paid amount, concessions, discounts, scholarship, and fine
- creates `StudentFeePayment` when the collection row is linked to an invoice
- updates invoice paid amount/status
- writes a `FeeAuditLog`

Collect Fees UI flow:

1. Search and select a student.
2. Select academic year/session and load that student's `FeeCollection` rows for the year.
3. Show the actual fee group from the linked `StudentFeeAssignment`.
4. Split rows into pending dues and paid history.
5. Show academic fee months/terms from the assigned fee snapshot.
6. Show transport separately when rows have `feeHeadName = Transport Fee`.
7. User selects months/terms or individual particulars.
8. Payment split captures one or more methods, amount, discount, and remarks.
9. `Collect Now` sends one bulk payload to `/api/school/fees/collections`.
10. The API allocates the received amount oldest-period first, applies discount/concession adjustments, updates `FeeCollection`, updates linked invoice totals/line statuses, and stores one shared receipt number for the selected rows.

## 8. User Interface Flow

Navigation:

```txt
Fees
  -> Fee Heads
  -> Fee Groups
  -> Fee Structures
  -> Fee Assignments
  -> Fee Invoices
  -> Fee Collections
```

Master setup UI:

- Fee Heads define the billing behavior, such as monthly, yearly, one-time, quarterly, custom, installment, or on-demand.
- Fee Groups define categories like `New Admission`, `Regular Student`, or `Staff Ward`; attaching heads to a group is optional.
- Fee Structures are created for one academic year/session, class, optional section, and fee group.
- Inside Fee Structures, the user chooses which active heads apply before entering amounts.
- The selected fee head billing behavior controls the amount entry grid automatically.

Assignment UI:

- Page: `src/features/fees/pages/fee-assignments-page.tsx`
- Creates student snapshots through `POST /api/school/fees/assignments`
- Lists assignment source, structure, group, item count, total, and status

Invoice UI:

- Page: `src/features/fees/pages/fee-invoices-page.tsx`
- Lists total demand, collected amount, and balance
- Supports status filtering
- Opens invoice details with line items and payment history
- Records invoice payments
- Locks/unlocks invoices
- Cancels unpaid invoices

## 9. Transport Rule

Transport remains separate.

Current behavior:

- Admission creates transport allocation and transport `FeeCollection` rows from the Transport module.
- Core academic fees are created from `FeesStructure`.

Do not manually add transport as a normal class fee head if the student uses the Transport module. Transport charges should continue to come from transport allocation.

## 10. Database Schema

The fees tables and fields live directly in `prisma/schema.prisma`.

There are no separate manual fees SQL files to run. To sync the PostgreSQL database from the schema during development, use:

```bash
bun run db:push
```

This keeps `schema.prisma` as the single database structure file for the project.

## 11. Next Phase

Recommended Phase 3:

- Add adjustment approval workflow.
- Add late fee rule engine with grace days and max cap.
- Add proration rules for mid-session admissions.
- Add refund workflow for `REFUNDABLE_DEPOSIT`.
- Add audit viewer for fee master and transaction changes.
- Add dedicated receipts/print support.
- Add promotion-time yearly fee reassignment flow.
