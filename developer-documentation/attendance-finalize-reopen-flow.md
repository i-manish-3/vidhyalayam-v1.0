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

## Operational Note

If `attendance:reopen` is assigned to a role and the button does not appear immediately, refresh the app session or log out and log in again because frontend permissions may be cached.
