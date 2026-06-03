# Vidhyalayam - School Management ERP

A comprehensive, multi-tenant **SaaS School Management ERP** built with **Next.js 16**, **React 19**, **TypeScript 5**, **Tailwind CSS 4**, and **Prisma ORM**. Manage admissions, students, teachers, fees, attendance, exams, payroll, transport, library, and more – all from one platform.

**Tech Stack**: Next.js 16 | React 19 | TypeScript 5 | Tailwind CSS 4 | Prisma ORM | PostgreSQL | Zustand | TanStack Query

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/<YOUR_USERNAME>/my-digital-academy.git
cd my-digital-academy

# One-command setup: installs deps, creates DB, seeds data
bun run setup

# Start the dev server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Prerequisites

- **[Bun](https://bun.sh/)** v1.0+ (recommended) or **Node.js** v18+
- **[PostgreSQL](https://www.postgresql.org/)** v12+
  - Local: use `bun run db:start` (embedded Postgres helper)
  - Or: managed service (Supabase, Neon, AWS RDS, etc.)
- **Git**

---

## Step-by-Step Setup

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/<YOUR_USERNAME>/my-digital-academy.git
cd my-digital-academy

bun install
# or: npm install
```

### 2. Configure Environment

```bash
# Copy the example env file
cp .env.example .env
```

Update `.env` with your database URL:

```env
# PostgreSQL connection string
DATABASE_URL=postgresql://user:password@localhost:5432/vidhyalayam

# JWT Secret (change in production!)
JWT_SECRET=school-erp-super-secret-key-2025
```

### 3. Initialize Database

```bash
# Push Prisma schema to PostgreSQL
bun run db:push

# Seed with demo data (schools, users, students, fees, etc.)
bun run seed
```

### 4. Start Development Server

```bash
bun run dev
```

Visit **http://localhost:3000**.

---

## Demo Login Credentials

After seeding, use these credentials:

| Role | Email | Password |
|:-----|:------|:---------|
| Super Admin | `superadmin@schoolerp.com` | `admin123` |
| School Admin | `admin@dpsdelhi.in` | `admin123` |
| Teacher | `anita.sharma@dpsdelhi.in` | `teacher123` |
| Student | `student@example.com` | `student123` |
| Parent | `9876543201` (phone) | `parent123` |

---

## What's Included

### Core Modules

- **Admissions** – Multi-step wizard, document upload, workflow (applied → verified → fee pending → admitted)
- **Students & Classes** – Enrollment, promotion, sections, attendance tracking
- **Academics** – Class structure, subjects, timetables, period configuration
- **Attendance** – Mark attendance, generate reports, manage leave
- **Exams** – Create exams, publish results, grade management
- **Fees** – Fee heads, structures, collections, invoices, audit trail, concurrent payment handling
- **Transport** – Routes, vehicle management, driver assignments
- **Payroll** – Salary structures, advance requests, salary payments
- **Library** – Book inventory, issue/return tracking
- **Communications** – Announcements, notifications, parent messaging
- **Operations** – Petty cash, inventory management, support tickets

### Role-Based Access Control (RBAC)

- **Super Admin**: Cross-tenant analytics, school subscriptions, user management
- **School Admin**: Full school configuration, all modules, teacher/staff management
- **Teacher**: Classes, attendance, timetable, exam results
- **Student**: Dashboard, results, attendance, assignments
- **Parent**: Child's attendance, fees, results, announcements
- **Staff**: Operations (inventory, petty cash, etc.)

### Multi-Tenancy

Every school is isolated via `schoolId` on all data rows. Soft delete support via `deletedAt`.

---

## Project Structure

```
prisma/
├── schema.prisma          # Prisma schema (all models tenant-scoped)
└── seed/                  # Seed scripts (index, admissions, academics, fees, etc.)

src/
├── app/
│   ├── page.tsx          # Landing page
│   ├── layout.tsx        # Root layout
│   ├── globals.css       # Global styles
│   └── api/              # REST API routes
│       ├── auth/         # Login, profile, permissions
│       ├── school/       # School admin endpoints
│       └── super-admin/  # Cross-tenant endpoints
│
├── components/
│   ├── app-layout.tsx    # Main app shell (theme + sidebar)
│   ├── app-sidebar.tsx   # Custom navigation sidebar
│   ├── login-screen.tsx  # Login UI
│   ├── dashboards/       # Role-specific dashboards
│   ├── ui/               # shadcn/ui primitives
│   └── shared/           # Data table, empty state, page header, etc.
│
├── features/             # Domain-specific pages
│   ├── admissions/       # Admission wizard & management
│   ├── students/         # Student detail, profiles
│   ├── academics/        # Classes, subjects, timetable
│   ├── attendance/       # Attendance marking & reports
│   ├── exams/            # Exam management & results
│   ├── fees/             # Fee structures & collections
│   ├── transport/        # Routes & vehicle management
│   ├── salary/           # Payroll management
│   ├── people/           # Teachers, parents, staff
│   ├── operations/       # Inventory, petty cash
│   ├── communications/   # Announcements, notifications
│   └── settings/         # School branding & configuration
│
├── lib/
│   ├── store.ts          # Zustand state (auth, nav, school)
│   ├── db.ts             # Prisma client singleton
│   ├── api-auth.ts       # API authentication helper
│   ├── api.ts            # API request utilities
│   ├── rbac.ts           # Role-based access control
│   ├── theme-palettes.ts # School theming system
│   ├── branding.ts       # Brand utilities
│   └── utils.ts          # General utilities
│
├── hooks/                # Custom React hooks
└── workers/              # Background jobs (demand slips, etc.)

scripts/
├── create-postgres-db.mjs   # Database creation helper
├── seed-exam-permissions.ts # Permission seeding
└── ...

public/
└── uploads/              # File storage for documents, logos, etc.
```

---

## Key Commands

```bash
# Development
bun run dev              # Start dev server (port 3000)
bun run build            # Build for production
bun run start            # Start production server
bun run lint             # Run ESLint

# Database
bun run db:push          # Push schema to database
bun run db:generate      # Generate Prisma client
bun run db:migrate       # Create a migration
bun run db:reset         # Reset database (delete all data)
bun run db:start         # Start embedded PostgreSQL helper

# Seeding
bun run seed             # Run all seed scripts
bun run seed-admissions  # Seed admissions only
bun run seed-fees        # Seed fees module
bun run seed-academics   # Seed academic structure
# ... (other individual seed commands)

# Setup
bun run setup            # One-command setup (install + db push + seed)

# Workers
bun run worker:demand-slips  # Start demand slip background worker
```

---

## Theming & Branding

Each school has its own visual identity:

- **Primary Color**: Chosen from predefined palettes, applies to buttons, accents, sidebar
- **Dashboard Font**: System fonts (Segoe UI, Arial, Verdana, Georgia, etc.)
- **Logo & Favicon**: Uploaded and stored in `public/uploads/`
- **Dark Mode**: Built-in dark/light toggle (via `next-themes`)

Theming is applied dynamically in `src/components/app-layout.tsx` using CSS variables.

---

## Authentication & Security

- **JWT-based auth** with `jsonwebtoken` and `bcryptjs`
- Tokens stored in `localStorage` (`erp_token`, `erp_user`, `erp_permissions`)
- RBAC with granular permissions per role
- Password change on first login support (`User.mustChangePassword`)
- Soft deletion of users (not physical removal)

---

## Navigation Model

**Important**: This app uses **state-based routing**, not URL-based.

- All screens live under one Next.js route; current page is determined by Zustand state (`currentPage`)
- Add new screen → update `PageName` union in `src/lib/store.ts` + add render branch in `src/components/app-layout.tsx`
- Navigate: `useAppStore.getState().setCurrentPage('students')`
- Back button: `goBack('dashboard')` (falls back if history empty)
- Entity IDs (`selectedStudentId`, `selectedClassId`, etc.) stored in Zustand; set before navigating to detail

---

## Database Schema Highlights

### Multi-Tenancy
- Every model has `schoolId` (required, indexed)
- Every model has `deletedAt` for soft deletion
- `School` model holds branding (`logo`, `favicon`, `primaryColor`, `dashboardFont`), subscription status, features

### Core Models
- **User** – Roles (SUPER_ADMIN, SCHOOL_ADMIN, TEACHER, STUDENT, PARENT), permissions, soft delete
- **School** – Tenant, branding, academic year, subscription status
- **Student** – Admission status, sibling linking, academic history
- **Admission** – Multi-tab workflow: Personal → Contact → General → Accounts; documents & activities tracking
- **Fees** – Heads, structures, collections, payments, audit trail with concurrent payment support
- **Class, Section, Subject** – Academic structure
- **Attendance, Exam, ExamResult** – Academic tracking
- **Teacher, Parent, StudentParent** – People management
- **TransportRoute, LibraryBook, SalaryStructure** – Ancillary modules

See `prisma/schema.prisma` for the full schema.

---

## API Architecture

REST API under `src/app/api/`:

### School Admin Endpoints
- `/api/school/{students, classes, sections, subjects, teachers, fees, attendance, exams, timetable, transport, library, inventory, announcements, notifications}`

### Super Admin Endpoints
- `/api/super-admin/{schools, subscriptions, analytics, team, testimonials, permissions}`

### Public Endpoints
- `/api/auth/{login, me, change-password}`
- `/api/pricing`, `/api/testimonials`, `/api/contact`

---

## Development Workflow

### Working on a Feature
1. Create a branch: `git checkout -b feature/your-feature`
2. Update the database if needed: `bunx prisma db push`
3. Implement your changes
4. Run linter: `bun run lint`
5. Test in the app at http://localhost:3000
6. Commit: `git commit -m "feat: description"`
7. Push and open a pull request

### Prisma Schema Changes
1. Edit `prisma/schema.prisma`
2. Stop the dev server
3. Run: `bunx prisma db push --skip-generate`
4. Run: `bunx prisma generate` (re-generates Prisma client)
5. Restart dev server: `bun run dev`

> **Note on Windows**: Prisma's query engine DLL gets locked by the dev server, so stop the server before running `prisma generate`.

---

## Common Issues

| Issue | Solution |
|:------|:---------|
| `DATABASE_URL` not set | Copy `.env.example` to `.env` and update with your database URL |
| Database connection fails | Ensure PostgreSQL is running and the connection string is correct |
| Prisma generate fails (Windows) | Stop the dev server first, then run `bunx prisma generate` |
| Port 3000 already in use | Kill the process or change port: `bun run dev -- -p 3001` |
| Seed fails | Ensure database is created (`bun run db:push` first) |
| localStorage fills up | Clear browser storage if logo/favicon are very large |

---

## Documentation

- **[Project Context](developer-documentation/project-context.md)** – Authoritative handoff doc with full architecture overview
- **[Admission Flow](developer-documentation/admission-flow.md)** – Step-by-step admission process
- **[Fees Module Flow](developer-documentation/fees-module-flow.md)** – Fee creation, assignment, collection
- **[Attendance & Reports](developer-documentation/attendance-reports.md)** – Attendance marking & reporting
- **[Transport Module Flow](developer-documentation/transport-module-flow.md)** – Routes & vehicle management
- **[Database Flow Chart](developer-documentation/database-flow-chart.md)** – Entity relationships

---

## Contributing

1. Read the **[Project Context](developer-documentation/project-context.md)** first
2. Follow the code style: Tailwind utilities, shadcn/ui components, Lucide icons
3. Use existing patterns: mirror neighboring features
4. Test your changes: `bun run lint` and manual QA
5. Commit with descriptive messages
6. Open a PR with context and testing notes

---

## Tips & Best Practices

- **Always read** `developer-documentation/project-context.md` before making non-trivial changes
- **Lint before committing**: `bun run lint`
- **Use Zustand** for client state (auth, nav, school) – do NOT introduce client-side routing
- **Seed data**: Run `bun run seed` anytime to reset to a clean demo state
- **Embedded Postgres**: Use `bun run db:start` in a separate terminal for a local database without separate installation
- **Theming**: Avoid hardcoded colors; use semantic tokens (`bg-primary`, `text-primary`, etc.)
- **Sidebar**: Custom implementation in `src/components/app-sidebar.tsx` – do NOT use shadcn/ui sidebar
- **Dashboard UIs**: Keep them operational and scannable, not marketing-heavy

---

## License

[Add your license here]

---

## Need Help?

- Check [Project Context](developer-documentation/project-context.md) – most answers are there
- Review existing features for patterns (e.g., fees → admissions)
- Use demo credentials to explore the app
- Check seed scripts for data structure examples
