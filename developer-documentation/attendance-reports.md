# Attendance Reports

## Purpose

A single page with four tabs that turn raw daily attendance into analysis-ready reports. Distinct from the single-day "View Attendance" page and the finalize/reopen "Audit Log".

Route: `/attendance/reports` (PageName `attendance-reports`). Sidebar: under **Attendance** parent (SCHOOL_ADMIN + TEACHER).

## Permission

- `SCHOOL_ADMIN` always has access.
- Other roles need `attendance:report:view`.
- API routes enforce the same rule; UI visibility is gated by [permission-mappings.ts](../src/lib/permission-mappings.ts).

## Attendance % formula

Strict: `percent = present / total_marked × 100`.

- The marking UI currently supports three statuses: **present**, **absent**, **leave**. (`late` and `half_day` exist in the DB enum for legacy/future use but the Mark Attendance page maps them to `leave`.)
- `total_marked` = count of all attendance rows for the student in range.
- Only `present` counts toward the numerator. `leave` counts toward the total but not as present.
- Reports render only the three active statuses (Present / Absent / Leave). If any legacy `late` / `half_day` rows exist in the DB they are folded into the total automatically and do not appear as separate columns.
- Students with zero marked days are excluded from the Defaulters list (they aren't "below threshold", just unmarked).

## Tabs

1. **Monthly Summary** — per-student totals + % for a class/section over the date range. Click a row's "View" → jumps to Calendar for that student.
2. **Daily Summary** — per-day, per-(class+section) turnout aggregates. Class is optional (omit for all classes). Sorted by date desc.
3. **Calendar** — one student's month as a 7-column grid with status badges + monthly totals. Has its own class/section/student pickers and month navigator; also receives a student pushed from the Monthly Summary / Defaulters tabs.
4. **Defaulters** — students below a threshold % (default 75), worst first, with a best-effort primary parent phone.

## Filters

Shared filter card (date range, class, section) sits above the tabs and applies to Monthly Summary, Daily Summary and Defaulters. Calendar uses its own month + student selectors. Defaulters adds a threshold input. All reports are scoped by the global `viewingAcademicYear`.

## Export

- **CSV**: each tab's API supports `?format=csv`; the client streams it to a file download.
- **Print / PDF**: browser print — a new window is opened with a self-contained, A4-styled HTML doc (reusing `buildPrintHeaderHtml` for the school header), then `window.print()`. User chooses "Save as PDF".

## Files

- API: `src/app/api/school/attendance/reports/{monthly-summary,daily-summary,calendar,defaulters}/route.ts`
- Shared server helpers: `src/lib/attendance-report-utils.ts`
- Page: `src/features/attendance/pages/attendance-reports-page.tsx`
- Tab components + print/types utils: `src/features/attendance/components/reports/`
- Status colours/icons (shared with mark/view): `src/features/attendance/lib/status-config.ts`
- Route wrapper: `src/app/(app)/attendance/reports/page.tsx`

## Operational Note

If `attendance:report:view` is assigned to a role and the menu doesn't appear immediately, refresh the session or log out/in — frontend permissions are cached.
