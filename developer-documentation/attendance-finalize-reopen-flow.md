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

If `attendance:reopen` or `attendance:audit:view` is assigned to a role and the button or menu does not appear immediately, refresh the app session or log out and log in again because frontend permissions may be cached.
