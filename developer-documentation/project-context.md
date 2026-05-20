# My Digital Academy - Project Context

This document is a handoff note for any future AI/model working on this project. Read this first before making changes.

## Project Summary

My Digital Academy is a multi-tenant school management ERP built with Next.js. It supports school admin, super admin, teacher, student, parent, and staff dashboards. The project has modules for admissions, students, attendance, fees, academics, transport, library, inventory, salary, notifications, announcements, roles, and permissions.

## Tech Stack

- Next.js 16 app router
- React 19
- TypeScript
- Tailwind CSS v4
- Radix UI components
- Lucide React icons
- Recharts for charts
- Zustand store in `src/lib/store.ts`
- Prisma ORM
- PostgreSQL database
- Bun for scripts and package execution

## Database

The app uses PostgreSQL, not SQLite.

Current local database URL is usually:

```env
DATABASE_URL=postgresql://z:postgres@127.0.0.1:5432/mydigitalacademy
```

Important commands:

```bash
bun run db:start
bun run db:push
bunx prisma generate
bun run seed
```

When Prisma client generation fails on Windows with a locked query engine DLL, stop the running Next/Node dev server, run `bunx prisma generate`, then restart the dev server.

## Useful Commands

```bash
bun run dev
bun run build
bunx eslint <file-path>
bun run db:push
bunx prisma generate
```

Production build may fail inside sandbox because Next fetches Google Fonts. If that happens, rerun the build with network approval.

## App Navigation

Navigation is controlled by Zustand:

- Store: `src/lib/store.ts`
- Main layout: `src/components/app-layout.tsx`
- Sidebar: `src/components/app-sidebar.tsx`
- Page routing is state-based, not URL route based.
- `currentPage` decides which component renders.
- Use `setCurrentPage(page)` for direct navigation.
- Use `goBack(fallback)` when adding back buttons.

## Sidebar State

The sidebar has been customized:

- Light mode sidebar/navbar follows the selected school primary palette.
- Dark mode remains dark/soft slate.
- Expanded sidebar keeps all main menus visible.
- Parent menu opens a right-side floating submenu panel.
- Nested submenu opens inside that panel with a back button.
- Collapsed sidebar still uses hover/click flyout behavior.

Main file:

```text
src/components/app-sidebar.tsx
```

## Dynamic Theme System

School admin can select a color palette in Settings.

Files:

- `src/lib/theme-palettes.ts`
- `src/features/settings/pages/settings-page.tsx`
- `src/components/app-layout.tsx`
- `src/app/api/school/info/route.ts`
- `prisma/schema.prisma`

Stored fields on `School`:

- `primaryColor`
- `dashboardFont`

Palette and font settings are saved through:

```text
PATCH /api/school/info
```

Theme variables are applied in `AppLayout` to both the app wrapper and `document.documentElement`, because portal components like tooltips render outside the layout tree.

Dark theme intentionally stays dark instead of following the selected bright school palette.

## Dynamic Fonts

School admin can choose dashboard font from Settings.

Font options currently use safe/system font stacks:

- System
- Segoe UI
- Arial
- Verdana
- Trebuchet
- Georgia

The selected font is saved in `School.dashboardFont` and applied globally in `AppLayout`.

## Settings Page

Settings page is now real, not a placeholder.

File:

```text
src/features/settings/pages/settings-page.tsx
```

Current features:

- Color palette selection
- Dashboard font selection
- Theme preview
- Saves school branding settings

Only `SCHOOL_ADMIN` can use school settings.

## Student Profile Page

Student profile has been redesigned multiple times and reverted/adjusted. Current preferred direction:

- Keep wizard-style tabs based on admission flow.
- No guardian details.
- No emergency contact.
- Upper/profile area should not duplicate details already shown in tabs.
- Documents tab should show properly.
- Sibling tab appears only if the student has siblings.

Main file:

```text
src/features/students/pages/student-detail-page.tsx
```

Admission-related docs:

```text
developer-documentation/admission-flow.md
```

## Admissions

Admission module stores student, parent/father/mother, class, documents, fee/account details, and siblings where applicable.

Removed from current admission flow:

- Guardian details
- Emergency contact

Seed data was updated to include admission-based students with parents and siblings. Old incomplete random 96-student seed was removed.

Main seed files:

```text
prisma/seed/index.ts
prisma/seed/admissions.ts
```

## Dashboard

School admin dashboard was redesigned.

Main file:

```text
src/components/dashboards/school-admin-dashboard.tsx
```

Current UI:

- School/date hero section
- Compact pill quick actions
- KPI strip
- Metric cards with progress bars
- Insight cards
- Theme-aware fee chart
- Attendance donut
- Operations snapshot
- Recent activity feed

Quick action buttons were intentionally made compact because large tiles looked visually heavy.

## Attendance

Mark Attendance page now has a back button in the header.

Main file:

```text
src/features/attendance/pages/attendance-page.tsx
```

Back behavior:

```ts
goBack('dashboard')
```

## Current Development Notes

- Prefer existing local UI patterns and Tailwind utility classes.
- Use lucide icons for buttons/actions.
- Keep dashboard/admin UIs operational and scan-friendly, not marketing-like.
- Avoid large decorative hero sections inside the app dashboard.
- Use `bg-primary`, `text-primary`, `border-primary`, etc. so dynamic palettes work.
- Avoid hardcoded emerald/green for global brand surfaces unless it is semantically success.
- Use `apply_patch` for file edits.
- Run targeted lint on changed files.
- Run `bun run build` after larger changes.

## Important Recent Files Changed

```text
prisma/schema.prisma
src/lib/store.ts
src/lib/theme-palettes.ts
src/app/page.tsx
src/app/globals.css
src/app/api/auth/me/route.ts
src/app/api/school/info/route.ts
src/components/app-layout.tsx
src/components/app-sidebar.tsx
src/components/dashboards/school-admin-dashboard.tsx
src/components/login-screen.tsx
src/features/settings/pages/settings-page.tsx
src/features/attendance/pages/attendance-page.tsx
src/features/students/pages/student-detail-page.tsx
```

## Verification Baseline

Targeted lint has been passing for touched files. Production build has passed after network approval for Google Fonts.

Known full TypeScript check issues existed previously in unrelated older areas like examples, landing page motion typings, and generic table typings. Do not assume a full `tsc --noEmit` failure was caused by recent work unless the error points to touched files.
