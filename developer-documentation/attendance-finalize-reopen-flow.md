# Attendance Finalize and Reopen Flow

## Purpose

Attendance can be finalized to lock daily records after marking is complete. If a correction is needed later, the finalized attendance can be reopened, edited, and finalized again.

## Rules

- Finalized attendance is locked and cannot be edited through normal save actions.
- Reopening requires a reason.
- After reopening, attendance becomes editable again.
- After corrections, attendance must be finalized again to lock it.
- Reopen/finalize actions are academic-year scoped through the attendance request payload.

## Permission Model

- `SCHOOL_ADMIN` can always reopen finalized attendance.
- Other users can reopen only if their role has `attendance:reopen`.
- The UI shows `Reopen Attendance` only when the current user is `SCHOOL_ADMIN` or has `attendance:reopen`.
- The API enforces the same rule, so access does not depend only on UI visibility.

## Audit Trail

Reopen/finalize actions are recorded in `AttendanceAuditLog`.

Stored fields:

- `schoolId`
- `academicYear`
- `date`
- `classId`
- `sectionId`
- `action` as `finalize` or `reopen`
- `reason` for reopen
- `performedBy`
- `createdAt`

## Current Implementation

- API: `src/app/api/school/attendance/route.ts`
- UI: `src/features/attendance/pages/attendance-page.tsx`
- Permission constant: `src/hooks/use-permissions.ts`
- Permission seed: `prisma/seed/index.ts`
- Audit table: `AttendanceAuditLog` in `prisma/schema.prisma`

## Change Log (per-student diffs)

When attendance is re-marked after a reopen, the `Attendance` row's `status` / `remarks` are **overwritten** — the previous value would be lost. To preserve accountability, every actual mutation is captured in `AttendanceChangeLog`.

- Table: `AttendanceChangeLog` ([schema.prisma](../prisma/schema.prisma))
- Captured fields: `schoolId`, `academicYear`, `studentId`, `date`, `oldStatus`, `newStatus`, `oldRemarks`, `newRemarks`, `changedBy`, `changedAt`
- **First-time marks are NOT logged** — `Attendance.createdAt` + `markedBy` already carry that information. The change log records mutations only.
- A `no-op` re-write (same status, same remarks) does NOT create a row.
- Writes are atomic per student: the `findUnique` (old value), `upsert` (new value), and optional change-log insert are wrapped in a single `db.$transaction`.

### Historical snapshots from audit clicks

Clicking any finalize/reopen row in the audit log viewer opens the View Attendance page in **snapshot mode** — reconstructing the attendance state as it was at that audit moment, not the current state.

- URL: `/attendance/view?date=YYYY-MM-DD&classId=…&sectionId=…&snapshot=<auditId>`
- API: `GET /api/school/attendance/snapshot?auditId=<id>` — reconstructs status per student by walking the change log forward (first change after the audit time gives `oldStatus` at that time; otherwise current value).
- A yellow banner indicates snapshot mode with capture time, actor, and reason. A "View Latest" button drops the snapshot param and re-fetches live data.
- Changing date / class / section / using Today button automatically exits snapshot mode (filters imply live navigation).
- The Mark Attendance shortcut is hidden in snapshot mode — historical views are read-only.
- Direct navigation to View Attendance from the sidebar (no `?snapshot=`) always shows the current state, never a snapshot.

### Viewer integration

In the audit log viewer ([attendance-audit-log-page.tsx](../src/features/attendance/pages/attendance-audit-log-page.tsx)), every reopen row that has changes shows a `View N changes` button on the right. Clicking it expands an inline panel listing every student-level diff that occurred between this reopen and the next subsequent audit event (finalize or another reopen) for the same `(date, classId, sectionId)`.

- API: `GET /api/school/attendance/audit-log/[id]/changes` — returns the changes for that reopen window.
- Permission: same `attendance:audit:view` (admins always allowed).
- Changes outside a reopen cycle (edits made while the day was still open) are still saved to `AttendanceChangeLog` but aren't surfaced in the viewer — they can be queried directly via SQL for forensic needs.

### CSV export structure

The audit log "Export CSV" button produces a **flat** layout where every row carries the audit-event columns AND (when applicable) the change-specific columns. A single reopen with N per-student changes becomes N rows in the CSV — all sharing the audit event metadata in the first 8 columns, and each carrying its student/diff data in the change columns.

Columns: `Audit Date | Class | Section | Action | Reason | Performed By | Performed By Email | Performed At | Student Roll | Student Name | Old Status | New Status | Old Remarks | New Remarks | Changed By | Changed At`

- A reopen with zero changes → one row with the change columns blank.
- A finalize event → one row with the change columns blank (finalize never has per-student diffs).
- Bounded by `CSV_AUDIT_CAP` (2000 audit events) and `CSV_TOTAL_ROW_CAP` (30 000 rows). When truncated, a final `# Truncated at …` comment line is appended so spreadsheet users see they need to refine filters.

## Audit Log Viewer

Separate page that lists finalize/reopen entries from `AttendanceAuditLog` for accountability and compliance.

- Page route: `/audit-logs/attendance` (PageName: `attendance-audit-log`)
- Sidebar entry: SCHOOL_ADMIN menu → "Audit Logs" → "Attendance"
- Permission: `SCHOOL_ADMIN` always has access; other roles need `attendance:audit:view`
- Filters: date range (default last 30 days), action (finalize/reopen/all), class, section, performed-by user
- Each row is a button; clicking it deep-links to `/attendance/view?date=...&classId=...&sectionId=...` so the admin can verify the affected day
- CSV export: top-right button. Backend route accepts `format=csv` and streams up to 5000 most-recent rows for the filter set
- Scoping: results are filtered by the global `viewingAcademicYear` so switching session changes what the log shows
- Files:
  - API: `src/app/api/school/attendance/audit-log/route.ts`
  - UI: `src/features/attendance/pages/attendance-audit-log-page.tsx`
  - Route wrapper: `src/app/(app)/audit-logs/attendance/page.tsx`

## Operational Note

Permissions are fetched fresh on every authenticated page load via the `usePermissions` hook ([src/hooks/use-permissions.ts](../src/hooks/use-permissions.ts)) and synced into the global store, so newly assigned permissions show up on the next page navigation without a logout. The sidebar reads from the same store. A hard refresh / re-login is therefore NOT required to see new permissions — older docs that suggested otherwise predated the store-sync fix.
