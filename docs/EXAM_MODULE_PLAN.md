# Exam Module — Implementation Plan

**Status:** Draft v1
**Owner:** Manish
**Created:** 2026-05-31
**Target Stack:** Next.js 14+, React 19, TypeScript, Prisma, PostgreSQL

---

## 1. Current State

The existing schema has two minimal models that are **insufficient** for a real exam module:

```prisma
model Exam        { id, schoolId, name, subjectId, classId, sectionId,
                    examDate, totalMarks, passingMarks, duration,
                    academicYear, createdAt, updatedAt, deletedAt }
model ExamResult  { id, schoolId, examId, studentId, marksObtained,
                    grade, remarks }
```

**Gaps:**
- No concept of an exam **group/term** (e.g., "Mid-Term 2026" containing many subject exams).
- No grading scheme — grade letters are free text per row.
- No theory/practical/internal split.
- No marks-entry workflow (draft → submitted → locked).
- No report cards.
- No analytics tables (ranks, percentiles).
- No subject mapping per class (existing `ClassSubject` will be reused).
- No marks-verification / re-evaluation trail.

The plan **extends** what's there. The existing `Exam` table will be repurposed as **ExamPaper** (one subject paper inside a group). Existing rows can be migrated cleanly because the field set is a subset.

---

## 2. Goals (confirmed with user 2026-05-31)

1. Exam scheduling & timetable
2. Marks/grades entry (theory + practical + internal)
3. Report card generation (printable)
4. Student performance analytics (ranks, trends)

Exam types: term exams, unit tests, internal assessments, board exams.
Grading: **flexible per exam** — each exam group picks its own scheme.
Multi-tenancy: **strict school isolation**, same pattern as the fee system.

---

## 3. Non-Goals (v1)

- Online exam delivery (question banks, MCQ engine, proctoring) — separate module later.
- AI-generated question papers — out of scope.
- Mobile native app — web only; mobile web must work.
- Live leaderboards / gamification — analytics is read-only reporting.

---

## 4. Data Model

### 4.1 New tables

```prisma
// ExamGroup — the umbrella ("Mid-Term 2026 — Class 10")
model ExamGroup {
  id            String    @id @default(cuid())
  schoolId      String
  academicYear  String
  name          String                       // "Mid-Term 2026"
  examType      String                       // TERM | UNIT_TEST | INTERNAL | BOARD
  termSequence  Int?                         // 1=Q1, 2=Q2, 3=Half, 4=Annual …
  classId       String                       // groups are scoped to one class
  gradingSchemeId String
  status        String   @default("draft")   // draft | scheduled | in_progress |
                                             // marks_entry | locked | published | archived
  startDate     DateTime?
  endDate       DateTime?
  resultPublishDate DateTime?
  weightInFinal Float    @default(0)         // for cumulative final-result calc
  notes         String?
  createdBy     String?
  publishedBy   String?
  publishedAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime?

  school         School         @relation(fields: [schoolId], references: [id])
  class          Class          @relation(fields: [classId], references: [id])
  gradingScheme  GradingScheme  @relation(fields: [gradingSchemeId], references: [id])
  papers         ExamPaper[]
  reportCards    ReportCard[]

  @@unique([schoolId, academicYear, classId, name])
  @@index([schoolId, academicYear])
  @@index([schoolId, status])
  @@index([classId])
}

// ExamPaper — one subject paper inside a group (replaces existing Exam)
model ExamPaper {
  id              String    @id @default(cuid())
  schoolId        String
  examGroupId     String
  subjectId       String
  sectionId       String?                    // null = applies to all sections
  examDate        DateTime?
  startTime       String?                    // "09:00"
  endTime         String?                    // "12:00"
  durationMinutes Int?
  roomNo          String?
  invigilatorId   String?                    // Teacher
  hasTheory       Boolean   @default(true)
  hasPractical    Boolean   @default(false)
  hasInternal     Boolean   @default(false)
  theoryMaxMarks    Float?  @default(80)
  practicalMaxMarks Float?  @default(0)
  internalMaxMarks  Float?  @default(20)
  passingMarks    Float     @default(33)     // overall, on (theory+practical+internal)
  syllabus        String?                    // free-text or URL
  instructions    String?
  status          String   @default("scheduled") // scheduled | marks_open |
                                                 // marks_submitted | locked
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  school     School      @relation(fields: [schoolId], references: [id])
  examGroup  ExamGroup   @relation(fields: [examGroupId], references: [id])
  subject    Subject     @relation(fields: [subjectId], references: [id])
  marks      ExamMark[]

  @@unique([examGroupId, subjectId, sectionId])
  @@index([schoolId])
  @@index([examGroupId])
  @@index([subjectId])
  @@index([invigilatorId])
  @@index([examDate])
}

// ExamMark — replaces ExamResult, supports the theory/practical/internal split
model ExamMark {
  id              String    @id @default(cuid())
  schoolId        String
  examPaperId     String
  studentId       String
  theoryMarks     Float?
  practicalMarks  Float?
  internalMarks   Float?
  totalMarks      Float?                     // derived but persisted for indexes
  graceMarks      Float     @default(0)
  attendance      String    @default("PRESENT") // PRESENT | ABSENT | EXEMPT |
                                                // MEDICAL | DETAINED | MALPRACTICE
  grade           String?                    // resolved at finalize time
  gradePoint      Float?
  isPass          Boolean?
  remarks         String?
  enteredBy       String?
  enteredAt       DateTime?
  submittedBy     String?
  submittedAt     DateTime?
  lockedBy        String?
  lockedAt        DateTime?
  version         Int       @default(1)      // optimistic lock for concurrent edits
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?

  school     School    @relation(fields: [schoolId], references: [id])
  examPaper  ExamPaper @relation(fields: [examPaperId], references: [id])
  student    Student   @relation(fields: [studentId], references: [id])

  @@unique([examPaperId, studentId])
  @@index([schoolId])
  @@index([studentId])
  @@index([examPaperId])
  @@index([attendance])
}

// GradingScheme — per-school, reusable. Each scheme has many bands.
model GradingScheme {
  id            String    @id @default(cuid())
  schoolId      String
  name          String                       // "CBSE 10-point", "Internal %", "Pass/Fail"
  scaleType     String                       // PERCENTAGE | ABSOLUTE | GPA | PASS_FAIL
  maxScale      Float     @default(100)
  isDefault     Boolean   @default(false)
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  school     School           @relation(fields: [schoolId], references: [id])
  bands      GradingBand[]
  examGroups ExamGroup[]

  @@unique([schoolId, name])
  @@index([schoolId])
}

model GradingBand {
  id            String   @id @default(cuid())
  gradingSchemeId String
  grade         String                       // "A+", "A", "B", "Pass", …
  minPercent    Float
  maxPercent    Float
  gradePoint    Float?                       // 10, 9, 8 … or null for non-GPA schemes
  description   String?                      // "Outstanding"
  isPass        Boolean  @default(true)
  sortOrder     Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt    DateTime @updatedAt

  gradingScheme GradingScheme @relation(fields: [gradingSchemeId], references: [id], onDelete: Cascade)

  @@unique([gradingSchemeId, grade])
  @@index([gradingSchemeId])
}

// ReportCard — one per (student, examGroup); built once and snapshot-frozen.
model ReportCard {
  id            String    @id @default(cuid())
  schoolId      String
  examGroupId   String
  studentId     String
  academicYear  String
  classId       String
  sectionId     String?
  totalMaxMarks   Float
  totalObtained   Float
  percentage      Float
  overallGrade    String?
  overallGradePoint Float?
  rankInClass     Int?
  rankInSection   Int?
  attendanceSummary String?                  // JSON: {present, absent, total, pct}
  classTeacherRemark String?
  principalRemark    String?
  status        String    @default("draft")  // draft | published | revoked
  publishedAt   DateTime?
  publishedBy   String?
  snapshotJson  String                       // full computed report payload
  pdfUrl        String?                      // generated PDF, optional caching
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  school     School     @relation(fields: [schoolId], references: [id])
  examGroup  ExamGroup  @relation(fields: [examGroupId], references: [id])
  student    Student    @relation(fields: [studentId], references: [id])

  @@unique([examGroupId, studentId])
  @@index([schoolId, academicYear])
  @@index([studentId])
  @@index([status])
}

// ExamAuditLog — mirrors FeeAuditLog. Every mutation goes here.
model ExamAuditLog {
  id         String   @id @default(cuid())
  schoolId   String
  entityType String                          // ExamGroup | ExamPaper | ExamMark |
                                             // GradingScheme | ReportCard
  entityId   String
  action     String                          // created | updated | marks_entered |
                                             // marks_submitted | marks_locked |
                                             // marks_revised | report_published |
                                             // report_revoked | reevaluation_started
  studentId  String?
  userId     String?
  ipAddress  String?
  userAgent  String?
  oldValue   String?                         // JSON snapshot
  newValue   String?
  diffSummary String?
  metadata   String?
  createdAt  DateTime @default(now())

  school  School   @relation(fields: [schoolId], references: [id])
  student Student? @relation(fields: [studentId], references: [id])
  user    User?    @relation(fields: [userId], references: [id])

  @@index([schoolId, entityType, createdAt])
  @@index([schoolId, studentId, createdAt])
  @@index([schoolId, userId, createdAt])
  @@index([createdAt])
}

// ExamConfig — per-school singleton, mirrors FeeDemandConfig / AdmissionSetting.
model ExamConfig {
  id            String  @id @default(cuid())
  schoolId      String  @unique
  defaultGradingSchemeId String?
  reportCardTemplate     String  @default("STANDARD") // STANDARD | CBSE | ICSE | CUSTOM
  reportCardLogoUrl      String?
  reportCardFooterText   String?
  showRankInReport       Boolean @default(true)
  showAttendanceInReport Boolean @default(true)
  showRemarksInReport    Boolean @default(true)
  requireDualVerification Boolean @default(false)  // marks need two signatures
  reevaluationGraceDays  Int     @default(15)
  allowParentDownload    Boolean @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  school School @relation(fields: [schoolId], references: [id])

  @@index([schoolId])
}
```

### 4.2 Migration of legacy `Exam` / `ExamResult`

- Treat existing rows as `examType=UNIT_TEST` inside an auto-created "Legacy" `ExamGroup` per (schoolId, academicYear, classId).
- Move marks into `ExamMark.theoryMarks` with `practical=0`, `internal=0`.
- After verification, drop the old tables in a follow-up migration. **Keep both tables side-by-side for one release** so production has a rollback window.

### 4.3 Indexes — performance-critical

- `ExamMark` heavy reads: `(schoolId, examPaperId)`, `(studentId, examPaperId)`, `(schoolId, studentId)` already covered above.
- `ReportCard.rankInClass` is computed; add `(examGroupId, totalObtained DESC)` if rank calc gets slow.
- All `deletedAt` lookups already implied by Prisma; no extra index unless slow.

---

## 5. API Surface

All endpoints under `/api/school/exams/...`, all require auth, all enforce `schoolId` isolation and RBAC permissions (`exam:read`, `exam:create`, `exam:enter_marks`, `exam:submit_marks`, `exam:lock_marks`, `exam:publish_report`, `exam:configure`).

### Grading schemes
- `GET    /grading-schemes`
- `POST   /grading-schemes`
- `GET    /grading-schemes/:id`
- `PATCH  /grading-schemes/:id`
- `DELETE /grading-schemes/:id`               soft-delete; block if in use
- `POST   /grading-schemes/:id/bands`
- `PATCH  /grading-schemes/:id/bands/:bandId`

### Exam groups
- `GET    /groups?academicYear=&classId=&examType=&status=`
- `POST   /groups`
- `GET    /groups/:id`                         includes papers + counts
- `PATCH  /groups/:id`                         only when status in (draft, scheduled)
- `POST   /groups/:id/publish`                 publish all report cards atomically
- `POST   /groups/:id/revoke`                  set status=published→archived, revoke report cards
- `DELETE /groups/:id`                         soft-delete; block if marks exist

### Exam papers
- `GET    /papers?examGroupId=`
- `POST   /papers`                             bulk-create supported (`papers: [...]`)
- `PATCH  /papers/:id`
- `DELETE /papers/:id`                         block if marks exist
- `GET    /papers/:id/timetable.pdf`           print-friendly timetable

### Marks entry
- `GET    /papers/:id/marks`                   roster + existing marks, all sections or filtered
- `PUT    /papers/:id/marks`                   bulk upsert with optimistic-lock `version` per row
- `POST   /papers/:id/marks/submit`            sectionId optional — submit a section's marks
- `POST   /papers/:id/marks/lock`              admin only; freezes the paper
- `POST   /papers/:id/marks/reopen`            admin only; writes audit row with reason
- `POST   /marks/:markId/revise`               for re-eval; logs old + new

### Report cards
- `POST   /groups/:id/report-cards/generate`   computes everything, writes snapshot
- `GET    /groups/:id/report-cards`            list w/ filters
- `GET    /report-cards/:id`                   includes snapshotJson
- `GET    /report-cards/:id/print`             HTML print view
- `GET    /report-cards/:id/pdf`               PDF (cached)
- `POST   /report-cards/:id/revoke`

### Analytics (read-only)
- `GET    /analytics/groups/:id/summary`        class avg, pass %, top scorers, fail list
- `GET    /analytics/groups/:id/subject/:subjectId` subject-level distribution
- `GET    /analytics/students/:studentId/trend?academicYear=` longitudinal
- `GET    /analytics/groups/:id/ranks`          ranked roster

### Config
- `GET    /config`
- `PATCH  /config`

---

## 6. UI Surface (App Router)

```
src/app/(school)/school/exams/
  page.tsx                          Dashboard — current groups, quick stats
  groups/
    page.tsx                        List + filter
    new/page.tsx                    Create wizard (type → class → grading scheme → papers)
    [groupId]/
      page.tsx                      Overview: papers, marks-entry progress, publish CTA
      papers/page.tsx               Timetable view (print-friendly)
      marks/page.tsx                Subject-wise tabs, section selector, spreadsheet UI
      report-cards/page.tsx         Generated cards, bulk-print, send-to-parent
      analytics/page.tsx            Charts: pass %, top/bottom, distribution
  grading-schemes/
    page.tsx
    [id]/page.tsx
  config/page.tsx

src/app/(school)/teacher/exams/
  page.tsx                          "My papers" view
  papers/[id]/marks/page.tsx        Marks-entry spreadsheet (only assigned subjects)

src/app/(school)/student/exams/
  page.tsx                          Past results + upcoming exams
  report-cards/[id]/page.tsx        Read-only report card

src/app/(school)/parent/exams/
  page.tsx                          Per-child report cards, download PDF
```

### UX notes
- Marks-entry uses a **virtualized grid** (`@tanstack/react-virtual`) for classes with 60+ students.
- Per-cell optimistic save, debounced 500ms, with the `version` field round-tripped to detect conflicts.
- Submit/Lock/Publish are explicit buttons that open a confirmation modal — never auto-triggered.
- Report card print uses CSS print stylesheet with school branding (`School.printHeader`, `primaryColor`).

---

## 7. Computation Rules

### 7.1 Total marks per paper
```
totalMarks = (theory ?? 0) + (practical ?? 0) + (internal ?? 0) + graceMarks
isPass     = totalMarks >= passingMarks && attendance == PRESENT
```
Absent / Medical / Detained / Malpractice never get a pass flag — those flow through to the report as flags, not zeros.

### 7.2 Grade resolution
```
percent = (totalMarks / paperMaxMarks) * 100
grade   = first band where percent ∈ [band.minPercent, band.maxPercent]
```
Recomputed at **mark finalize time**, not at every read. Stored on the row so historical rebands don't silently rewrite the past.

### 7.3 Report card aggregation
- `totalMaxMarks` = sum of each paper's `(theory+practical+internal)` max.
- `totalObtained` = sum of `ExamMark.totalMarks` across all papers in the group for that student.
- `percentage` = obtained / max * 100, rounded to 2 dp.
- `overallGrade` = scheme-based on percentage.
- `rankInClass` = window-function rank ordered by `totalObtained DESC`, tie-break by `percentage`, then `attendance %`.

### 7.4 Cumulative final result (multi-term)
- Each `ExamGroup` has `weightInFinal`. If schools want a final card, we sum `weighted percentages` across published groups in the same academic year.
- v1 ships per-group report cards; cumulative is opt-in via a separate "Annual Report" generator that consumes existing snapshots.

---

## 8. Workflow & State Machine

```
ExamGroup:
  draft → scheduled → marks_entry → locked → published → archived
                                       ↓
                                   revoked → draft (admin only)

ExamPaper:
  scheduled → marks_open → marks_submitted → locked
                                ↑               ↓
                               reopen (admin, audited)

ExamMark:
  empty → draft (auto-saved) → submitted → locked
                                  ↑          ↓
                                  ←─── reopen (admin)
```

Transitions:
- `marks_open` happens automatically when `examDate` passes or admin opens it.
- `lock` requires **all sections submitted** for the paper.
- `publish` requires **all papers locked** in the group.

---

## 9. Concurrency & Edge Cases

| Scenario | Handling |
|---|---|
| Two teachers edit the same student's marks | `version` field; second write returns 409, UI shows diff + merge. |
| Teacher submits while admin is locking | DB transaction; the locked-state check is inside the txn. |
| Student joins class mid-term | Roster snapshot at exam-group creation **+** runtime union with active enrollments — new joiners show up but their marks default to `ABSENT` unless explicitly entered. |
| Student withdrawn mid-term | Roster excludes withdrawn students from new papers; existing marks stay (already audited). |
| Re-evaluation request | `POST /marks/:id/revise` writes a new `ExamMark` row via versioned update + `ExamAuditLog` row with old + new + reason. The old grade is preserved in `oldValue`. |
| Grading scheme edited after marks finalized | Block the edit if the scheme is referenced by any **published** group. Allow it for draft groups; otherwise force "clone scheme" flow. |
| Bulk operations (200+ students × 10 papers) | API uses Prisma `$transaction` with chunked `createMany` / `updateMany`. Generator runs server-side; for >500 students we offload to a background job (same pattern as `FeeDemandRun`). |
| Print-at-scale (whole-class PDFs) | Use `puppeteer-core` + `@sparticuz/chromium` (or a worker process). Cache PDFs to S3-equivalent; invalidate on `report-card revoke`. |
| Academic-year rollover | `ExamGroup.academicYear` is captured at creation — never re-derived. Promoting a student does not retro-affect past report cards. |

---

## 10. Security & RBAC

New permission codes (seeded into `Permission`):

```
exam:read              Anyone with school access in the right scope (admin, teacher of subject, the student, the parent)
exam:create            SCHOOL_ADMIN + custom roles
exam:configure         SCHOOL_ADMIN
exam:enter_marks       TEACHER (only for papers where they are invigilator OR subject teacher)
exam:submit_marks      TEACHER
exam:lock_marks        SCHOOL_ADMIN
exam:reopen_marks      SCHOOL_ADMIN
exam:revise_mark       SCHOOL_ADMIN
exam:publish_report    SCHOOL_ADMIN
exam:revoke_report     SCHOOL_ADMIN
exam:view_analytics    SCHOOL_ADMIN, TEACHER (class teacher only)
```

Row-level guards inside every API handler — exactly the same pattern as `requirePermission` in `src/app/api/school/exams/route.ts:43`. Students see only their own marks; parents see only their children's.

---

## 11. Audit & Compliance

Every write to `ExamGroup`, `ExamPaper`, `ExamMark`, `ReportCard`, `GradingScheme` emits an `ExamAuditLog` row. Reads of published report cards by parents/students are tracked at the access-log level (not in `ExamAuditLog` — too noisy).

Retention: 5 academic years for `ExamAuditLog`, matching fee-audit policy.

---

## 12. Testing Strategy

| Layer | Target | Notes |
|---|---|---|
| Unit | 85%+ on `src/lib/exam/*` (grade resolver, rank calc, snapshot builder) | Vitest; pure functions, table-driven. |
| Integration | All API routes — happy path + RBAC denial + tenant-isolation cross-school attempts. | Prisma test DB per worker; uses existing seed helpers. |
| E2E | Playwright: full flow (create group → schedule → enter marks as teacher → lock as admin → publish → parent views report). | Critical-path only; per `web/testing.md`. |
| Concurrency | Two parallel mark-submits must produce one 200 + one 409 with diff payload. | Vitest + raw Prisma client. |
| Snapshot | Report-card HTML golden file per template (`STANDARD`, `CBSE`, `ICSE`). | Visual diff via Playwright screenshot. |

Coverage gate: **80% minimum, fails CI under threshold.**

---

## 13. Phased Delivery

Each phase is independently shippable, with its own migration + feature flag. The user's "production-ready" rule applies — no half-built phases.

### Phase 1 — Foundations *(2-3 days)*
Schema + grading schemes + config + audit infra. No UI changes for end users yet; admin can manage schemes via a hidden page.

- Migrate schema (`db push` in dev, baselined migration for prod).
- Seed default grading schemes (CBSE 5-band, Pass/Fail, Percentage).
- `/api/school/exams/grading-schemes/*` + `/config` endpoints.
- Admin UI: `/school/exams/grading-schemes`, `/school/exams/config`.
- Permission seed + RBAC tests.

### Phase 2 — Scheduling *(2 days)*
- `ExamGroup` + `ExamPaper` CRUD APIs.
- Admin UI: create group wizard, papers list, timetable view.
- Print-friendly timetable PDF.
- Migrate legacy `Exam` rows into the new `ExamPaper` via a one-shot script.

### Phase 3 — Marks Entry *(3-4 days)*
- `ExamMark` upsert API with optimistic locking.
- Teacher marks-entry grid (virtualized, autosave, conflict resolution).
- Submit/lock/reopen flow with audit.
- Bulk import via CSV (subject-by-subject, dry-run preview).
- Validation: marks ≤ max, attendance state-machine, grace-marks cap.

### Phase 4 — Report Cards *(3 days)*
- `ReportCard` generator with snapshot serialization.
- Three print templates (STANDARD, CBSE, ICSE) with school branding.
- PDF generation worker.
- Publish/revoke flow with audit.
- Parent/student view.

### Phase 5 — Analytics *(2 days)*
- Class summary endpoint + chart UI (recharts already in stack).
- Subject distribution endpoint + chart.
- Student trend endpoint + chart.
- Rank computation + tie-break.

### Phase 6 — Polish & migrations *(1-2 days)*
- Drop legacy `Exam` / `ExamResult` tables after one stable release.
- Documentation in `docs/EXAM_MODULE.md`.
- WhatsApp notification on report publish (reuses `FeeNotification` provider abstraction).
- Performance pass: load-test a 1500-student class on Phase 3 and Phase 4 grids.

**Total: ~13-16 dev days, single-engineer pace.**

---

## 14. Open Questions

1. **Should board exams (CBSE/ICSE) actually be stored here**, or just reference an external result (PDF upload)? Recommendation: store like any other group, but mark `examType=BOARD` so analytics can exclude/include explicitly.
2. **Co-scholastic grades** (Work Ed, Art, PE) — separate from academic grading? CBSE expects them in a separate report-card section. v1 supports them as `examType=INTERNAL` papers with a `PASS_FAIL` grading scheme; richer UI in v2.
3. **Cumulative final result calc** — v1 ships per-term cards; cumulative as a separate generator. OK to defer? Or block on it?
4. **PDF generation infra** — already in the project? If not, we add `puppeteer-core` + chromium binary, which is the heaviest new dep.
5. **Re-evaluation fee** — does the workflow need to charge a re-eval fee and create a fee invoice? If yes, this becomes a Phase 5/6 integration with the existing fee module.

---

## 15. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Migration of legacy `Exam` rows corrupts production marks | Medium | Keep both schemas side-by-side for one release; script writes new rows but doesn't drop old ones until verified. |
| Marks-entry grid sluggish on big classes | Medium | Virtualized grid + per-row save; load-test at end of Phase 3. |
| Grading-scheme edits silently change historical grades | High if not guarded | Block edits to schemes referenced by published groups; force clone. |
| PDF generation memory blowup | Medium | Worker queue with concurrency limit; stream to disk, not memory. |
| Concurrent teacher edits create data races | High if not guarded | Optimistic `version` field on `ExamMark`; UI handles 409s. |
| Tenant leak (school A sees school B's marks) | Critical if it happens | Every query has `schoolId` filter + integration test that tries cross-tenant reads and expects 404. |

---

## 16. Acceptance Criteria (Phase 1-6 cumulative)

- A school admin can create a "Mid-Term 2026" group for Class 10, add 6 papers (Eng/Hindi/Math/Sci/SS/Sanskrit) with theory+practical splits, assign a grading scheme, and see it on a timetable PDF.
- The subject teacher logs in, sees only their assigned papers, enters marks for 40 students with autosave, and submits.
- The admin locks the paper, then locks the group, then publishes — all 40 students get a report card.
- The parent logs in, sees the card, downloads the PDF.
- The admin sees a class analytics page with pass %, average, top-5, bottom-5 by subject.
- Two teachers editing the same student simultaneously: the second one sees a conflict modal and resolves it.
- A cross-tenant API call (school A's admin trying to read school B's marks) returns 404, not 403, and is logged.
- All 6 phases have ≥80% test coverage, CI green.

---

## 17. Decisions Needed Before Phase 1 Starts

Please confirm or adjust:

- **a.** Are the 5 open questions in §14 OK to resolve as recommended (board exams stored here; co-scholastic as INTERNAL; cumulative deferred; add puppeteer; re-eval fee deferred)?
- **b.** Do you want Phase 1 to also include the **default grading scheme seed** for new schools, or should every school create their own from scratch?
- **c.** PDF generation infra — confirm you want puppeteer added (vs. lighter alternatives like `@react-pdf/renderer` which is more limited but lighter).
- **d.** Should Phase 3 ship CSV import on day 1, or defer to Phase 6?

Once these four are answered, I'll start Phase 1 with schema + grading-scheme APIs + tests, following the same production-ready playbook used in fee-collection phase 6.5.
