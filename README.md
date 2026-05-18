# ğŸ“ My Digital Academy â€” School Management ERP System

A full-featured, multi-tenant SaaS School Management ERP built with **Next.js 16**, **TypeScript**, **Tailwind CSS 4**, and **Prisma ORM**. Manage students, teachers, fees, attendance, exams, payroll, library, transport, and more â€” all from one platform.

---

## ğŸ“¸ Screenshots

| Landing Page | Dashboard |
|:---:|:---:|
| *Modern landing with pricing, testimonials, team section* | *Analytics dashboard with real-time data* |

| Admission Wizard | Fee Management |
|:---:|:---:|
| *Multi-step admission form with document upload* | *Fee collection, receipts, and structure management* |

---

## ğŸš€ Quick Start (One Command)

```bash
# Clone the repo
git clone https://github.com/<YOUR_USERNAME>/my-digital-academy.git
cd my-digital-academy

# Setup everything (install deps, push PostgreSQL schema, seed data)
bun run setup

# Optional: start the embedded local PostgreSQL helper in another terminal
bun run db:start

# Start the dev server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ğŸ“‹ Step-by-Step Setup

If you prefer to run each step manually:

### 1. Prerequisites

- **[Node.js](https://nodejs.org/)** v18+ or **[Bun](https://bun.sh/)** v1.0+
- **Git**
- **PostgreSQL** running locally, or a managed PostgreSQL database such as Supabase/Neon

> **Recommended:** Use [Bun](https://bun.sh/) for faster installs and script execution.

### 2. Clone & Install

```bash
git clone https://github.com/<YOUR_USERNAME>/my-digital-academy.git
cd my-digital-academy

# Install dependencies
bun install
# or
npm install
```

### 3. Environment Variables

```bash
# Copy the example env file
cp .env.example .env
```

The `.env` file contains:

```env
# Database - PostgreSQL
DATABASE_URL=postgresql://z:postgres@127.0.0.1:5432/mydigitalacademy

# JWT Secret â€” Change this in production!
JWT_SECRET=school-erp-super-secret-key-2025
```

> **Note:** This project uses PostgreSQL only. Make sure the database in `DATABASE_URL` exists and is reachable before running Prisma commands.

### 4. Create Database & Seed Data

```bash
# Push the Prisma schema to PostgreSQL
bun run db:push

# Seed the database with demo data (schools, users, students, etc.)
bun run seed
```

### 5. Start Development Server

```bash
bun run dev
```

The app runs at **http://localhost:3000**.

---

## ğŸ” Demo Login Credentials

After seeding, you can log in with these accounts:

| Role | Email / Phone | Password |
|------|--------------|----------|
| **Super Admin** | `superadmin@schoolerp.com` | `admin123` |
| **School Admin** | `admin@dpsdelhi.in` | `admin123` |
| **Teacher** | `anita.sharma@dpsdelhi.in` | `teacher123` |
| **Student** | `student@example.com` | `student123` |
| **Parent** | `9876543201` (phone) | `parent123` |

---

## ğŸ—ï¸ Tech Stack

| Technology | Purpose |
|-----------|---------|
| **Next.js 16** | React framework with App Router & Turbopack |
| **TypeScript 5** | Type-safe development |
| **Tailwind CSS 4** | Utility-first styling |
| **shadcn/ui** | UI component library (New York style) |
| **Prisma ORM** | Database ORM with PostgreSQL |
| **Zustand** | Client-side state management |
| **TanStack Query** | Server state management |
| **Framer Motion** | Animations & transitions |
| **Sonner** | Toast notifications |
| **Recharts** | Data visualization / charts |
| **Lucide Icons** | Icon library |
| **next-themes** | Dark / Light mode |

---

## ğŸ“¦ Project Structure

```
my-digital-academy/
+-- prisma/
¦   +-- schema.prisma              # Database schema
¦   +-- seed/                      # Database seed scripts
¦       +-- index.ts               # Core demo data
¦       +-- pricing.ts             # Pricing plans
¦       +-- team.ts                # Team members
¦       +-- notifications.ts       # System notifications
+-- public/                        # Static assets and uploads
+-- scripts/                       # Local setup/maintenance scripts
+-- src/
¦   +-- app/                       # Next.js App Router pages and API routes
¦   ¦   +-- api/                   # REST API route handlers
¦   +-- components/                # App shell, dashboards, shared UI
¦   ¦   +-- ui/                    # shadcn/ui components
¦   ¦   +-- shared/                # Reusable app components
¦   ¦   +-- dashboards/            # Role-specific dashboards
¦   +-- features/                  # Domain-oriented feature pages
¦   ¦   +-- academics/
¦   ¦   +-- admin/
¦   ¦   +-- admissions/
¦   ¦   +-- attendance/
¦   ¦   +-- communications/
¦   ¦   +-- exams/
¦   ¦   +-- fees/
¦   ¦   +-- marketing/
¦   ¦   +-- operations/
¦   ¦   +-- people/
¦   ¦   +-- salary/
¦   ¦   +-- students/
¦   ¦   +-- transport/
¦   +-- hooks/                     # Custom React hooks
¦   +-- lib/                       # Shared client/server utilities
+-- .env.example                   # Environment template
+-- package.json                   # Dependencies and scripts
```
---

## ğŸ§© Modules

| Module | Description |
|--------|------------|
| ğŸ« **Multi-Tenant Schools** | Manage multiple schools from one platform |
| ğŸ‘¨â€ğŸ“ **Student Management** | Admissions, profiles, enrollment, siblings |
| ğŸ‘¨â€ğŸ« **Teacher Management** | Profiles, qualifications, subject assignments |
| ğŸ‘¨â€ğŸ‘©â€ğŸ‘§ **Parent Portal** | Parent login, child tracking, communication |
| ğŸ’° **Fee Management** | Fee heads, groups, structures, collections, receipts |
| ğŸ“‹ **Attendance** | Daily attendance marking, reports, export |
| ğŸ“ **Exam & Results** | Exam scheduling, result entry, report cards |
| ğŸ’µ **Salary & Payroll** | Salary structures, monthly payslips, advance requests |
| ğŸšŒ **Transport** | Route management, stop allocation, fee tracking |
| ğŸ“š **Library** | Book catalog, issue/return, fine tracking |
| ğŸ“¦ **Inventory** | Asset tracking, procurement, condition monitoring |
| ğŸª™ **Petty Cash** | Cash flow, approval workflow, category tracking |
| ğŸ“¢ **Announcements** | School-wide, targeted announcements |
| ğŸ”” **Notifications** | In-app notifications, type-based alerts |
| ğŸ« **Support Tickets** | Issue tracking, priority, resolution |
| ğŸ” **RBAC** | Role-based access control, permissions, custom roles |
| ğŸ  **Landing Page** | Public website with pricing, testimonials, team |
| ğŸ“Š **Super Admin Dashboard** | Cross-school analytics, school management, contacts |
| ğŸ“ˆ **School Admin Dashboard** | School-specific analytics, quick actions |
| ğŸ“ **Admission Wizard** | Multi-step admission with document verification |

---

## ğŸ› ï¸ Available Scripts

| Command | Description |
|---------|------------|
| `bun run setup` | Full setup: env â†’ install â†’ db â†’ seed |
| `bun run dev` | Start development server (port 3000) |
| `bun run build` | Build for production |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint checks |
| `bun run db:push` | Push Prisma schema to database |
| `bun run db:generate` | Generate Prisma client |
| `bun run seed` | Run all seed scripts |
| `bun run seed-pricing` | Seed pricing plans |
| `bun run seed-team` | Seed team members |
| `bun run seed-notifications` | Seed notification templates |

---

## ğŸ¨ Theme Customization

The project uses an **emerald/slate** color theme defined in CSS variables (`src/app/globals.css`):

- **Primary:** Emerald (brand green)
- **Destructive:** Red (error states)
- **Warning:** Amber (warning states)
- **Info:** Teal (informational states)
- **Neutrals:** Slate family

Dark mode is fully supported via `next-themes`.

---

## ğŸ“„ Database

This project uses **PostgreSQL** via Prisma ORM.

- Local default URL: `postgresql://z:postgres@127.0.0.1:5432/mydigitalacademy`
- Managed PostgreSQL providers such as Supabase or Neon can be used by changing `DATABASE_URL`
- Schema: `prisma/schema.prisma` (40+ models)
- Prisma reads `DATABASE_URL` from `.env`

To reset the database:

```bash
bun run db:reset
bun run seed
```

---

## ğŸ¤ Contributing

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Commit: `git commit -m "feat: your feature description"`
4. Push: `git push origin feat/your-feature`
5. Open a Pull Request

---

## ğŸ“ License

This project is proprietary. All rights reserved.

---

<p align="center">
  Built with â¤ï¸ by <strong>My Digital Academy</strong>
</p>
