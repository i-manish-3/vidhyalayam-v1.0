# Exam Module — End-to-End User Guide

> **Audience**: School admin, principal, exam coordinator, teachers.
> **Goal**: Take you from "we want to run a Half-Yearly exam" to "parents have downloaded their child's report card."

The module is built as a 7-stage pipeline. Each stage is a separate page. You can pause and come back — work is saved as you go. Where helpful, the "who does this" column tells you which role normally handles that step.

---

## The Pipeline at a Glance

```
1. Exam Pattern (Paradigm)   →  Set up once per academic year
2. Exam Group (Term)         →  Inside the paradigm
3. Exam                      →  Inside the group (Half-Yearly, Unit Test, etc.)
4. Subject Config + Components → Per-class, per-subject (Theory 80 + Practical 20)
5. Schedule                  →  Dates, times, rooms, invigilators
6. Marks Entry               →  Per student, per component
7. Compute Results           →  Engine assigns grades + ranks
8. Publish                   →  Parents/students can see results
9. Report Cards              →  Print or download
```

Steps 1–5 are **setup** (done once per exam). Steps 6–9 are **operations** (every exam cycle).

---

## Stage 1 — Set Up the Exam Pattern (Paradigm)

**Who**: School admin
**Where**: Sidebar → **Exams → Exam Patterns**
**Frequency**: Once per academic year (seeded by default)

The "paradigm" is your school's overall exam framework for the year. A CBSE school typically runs **"CBSE Term Pattern 2026-2027"** with two terms; a coaching center may run **"Test Series 1"** with 10 weekly tests.

1. The default paradigm is pre-seeded.
2. Click into it to view aggregation rule (how Term 1 + Term 2 combine into the final result) and passing rule (33% per subject, 33% overall, 5 grace marks allowed).
3. You almost never need to touch this. Move on.

---

## Stage 2 — Set Up Exam Groups (Terms)

**Who**: School admin
**Where**: Sidebar → **Exams → Exam Patterns** → click paradigm → **Groups**
**Frequency**: Once per academic year

Groups are the "buckets" inside a paradigm. CBSE schools have **Term 1** and **Term 2**. Coaching centers might call them **Test Series 1**, **Test Series 2**.

1. The default has Term 1 + Term 2 already created.
2. Each group has a weight (Term 1 = 50%, Term 2 = 50%) — that's how the final aggregation knows what to do.
3. Move on.

---

## Stage 3 — Create an Exam

**Who**: School admin
**Where**: Sidebar → **Exams → Exam List** → **+ New exam**
**Frequency**: Each time you run a new exam (Unit Test, Half-Yearly, Annual, etc.)

This is where actual exam events live. Each exam belongs to a group.

1. Click **+ New exam**.
2. Fill in:
   - **Name**: "Half-Yearly Examination"
   - **Short code**: "HY"
   - **Group**: Term 1
   - **Academic year**: 2026-2027
   - **Type**: written (also: practical, oral, project, internal, activity, attendance)
   - **Start date / End date**: When the exam runs
3. Pick which **classes** this exam applies to (e.g. Class 10 only, or all classes).
4. Save. The exam appears in the **Exam List** with status **Draft**.

---

## Stage 4 — Configure Subjects + Components

**Who**: School admin
**Where**: Sidebar → **Exams → Exam List** → click **Configure** on the exam row
**Frequency**: Once per exam (only when subject pattern changes)

This defines, for each (class × subject), what the exam looks like:
- Total marks (typically 100)
- Passing marks (typically 33)
- Grace marks max (typically 5)
- **Component split** — e.g. Theory 80 + Internal 20 = 100

1. You'll see a grid: rows = classes, columns = subjects.
2. Click **+ Add subject** to add a (class, subject) row.
3. For each subject, click **Components** to define the split. The component max marks **must add up** to the subject total marks — the page enforces this.
4. Examples:
   - **Maths**: Theory 80 + Internal 20 = 100
   - **Science**: Theory 80 + Practical 20 = 100
   - **English**: Literature 50 + Grammar 30 + Project 20 = 100
   - **Co-scholastic subjects** (Discipline, Art): toggle **Grade only** — no marks, just a grade letter.
5. Save. Status moves from Draft → Scheduled when all subjects are configured.

> **Tip**: If a subject pattern is the same across multiple classes, you can copy a row.

---

## Stage 5 — Set the Schedule

**Who**: School admin / exam coordinator
**Where**: Sidebar → **Exams → Exam List** → click **Schedule** on the exam row
**Frequency**: Once per exam

The schedule is the timetable: dates, times, rooms, invigilators.

1. The system shows a grid: rows = subjects, columns = (date + time + room + invigilator).
2. Fill in each row. The system **detects conflicts**:
   - Same invigilator double-booked
   - Same (class, section) writing two papers in overlapping windows
   - Same subject duplicated for the same (class, section)
3. Conflicts show as red warnings — fix them before saving.
4. Save. Status moves Scheduled → Ongoing once the start date passes.

Optional: from this page you can also **download admit cards** (one per student, signed QR code).

---

## Stage 6 — Enter Marks

**Who**: Subject teacher (mainly) or class teacher (read-all) or admin (override)
**Where**: Sidebar → **Exams → Exam List** → click anywhere on the exam row, or click the green **Enter marks** button
**Frequency**: After each exam paper is corrected

This is where day-to-day work happens.

1. The Marks Entry page loads with three filters at the top: **Class → Section → Subject**.
2. Pick a combination. The grid shows:
   - One **row per student** (with roll no., name).
   - One **column per component** (Theory, Practical, Internal — based on what you configured in Stage 4).
   - A **status dropdown** (Present / Absent / Medical Leave / Not Applicable) — for absent students, leave the marks blank and set status.
   - A **grace marks** column (capped by `graceMarksMax`).
   - A **running total** at the right edge.
3. **Type a number** in any cell. The system **auto-saves 1.5 seconds after you stop typing**. Watch for the "All changes saved" badge.
4. Edge cases:
   - **Mid-session joiners**: the system detects students whose admission date is after the exam start date and marks them **NA** by default.
   - **Validation**: typing 85 in a column that maxes at 80 is rejected immediately.
   - **Grade-only subjects**: dropdown of grade letters (A1, B2, etc.) instead of a number input.
5. When you finish a (class, section, subject), click **Submit**. Submitted marks get a `submittedAt` timestamp.
6. When the school admin is happy with the whole subject, they click **Lock** — after that, no one (not even the teacher) can edit those marks. Unlock requires a written reason that goes into the audit log.

> **Permission**: A teacher can only edit subjects they're assigned to via the `TeacherSubjectAssignment` table (or their class as class teacher). Admins can override.

---

## Stage 7 — Compute Results

**Who**: School admin
**Where**: Sidebar → **Exams → Exam List** → click **Results** on the exam row
**Frequency**: After all marks are locked

This runs the **result calculator engine**. It's pure computation — no email, no notification yet.

1. On the Results page, click **Recompute**.
2. The engine does, per student:
   - Subject summary: sum component marks, apply grace if eligible, resolve grade from band.
   - Exam result: aggregate subjects → total, percentage, overall grade.
   - Pass/fail status based on the paradigm's passing rule.
   - **Rank assignment**: within class and within section. Ties broken by total obtained marks.
3. The page reloads showing:
   - 5 stat cards: Total / Passed / Partial / Failed / Average %
   - A ranked table: roll no., student name, total, obtained, %, grade, status, rank
   - Top 3 ranks get a trophy icon
4. Filter by class or section if you want to recompute a subset. Optionally view the **Reports** dashboard (next to the Results button) for class-wise pass rates and subject-wise top/bottom performers.

> **The numbers shown are read from the DB**, not recomputed on render. So once you compute, results are stable until you recompute.

---

## Stage 8 — Publish to Parents

**Who**: Principal / school admin (`exam:result:publish` permission)
**Where**: Sidebar → **Exams → Exam List** → click **Results** on the exam row → **Publish** button
**Frequency**: When results are reviewed and ready

Before publishing, results are admin-only. Parents/students see nothing.

1. On the Results page, the header badge says **"DRAFT — not visible to parents"**.
2. Click **Publish**. The system:
   - Sets `visibleToParent=true` and stamps `publishedAt` + `publishedBy`.
   - Moves exam status → `result_published`.
   - Writes a `result_published` audit row.
3. The badge changes to **"PUBLISHED · visible to parents"**.
4. Need to fix something post-publish? Click **Unpublish** — a reason is required (it goes into the audit log permanently).
5. Re-publish after fixing.

For year-end results (FinalResult per paradigm), use **Exams → Exam Patterns → click paradigm → Publish Final** instead.

---

## Stage 9 — Generate / Print Report Cards

**Who**: School admin / class teacher (`exam:reportcard:download` permission)
**Where**: Sidebar → **Exams → Exam List** → click **Results** → **Print report cards**
**Frequency**: After publish

### Bulk print

1. On the Results page (post-publish), click **Print report cards**.
2. A new browser tab opens with one report card per student, formatted for A4 portrait, ready to print.
3. Hit **Ctrl+P** (or click **Print**). The browser's "Save as PDF" works as the download path — no separate PDF server needed.
4. Each card shows:
   - School header (logo, address, affiliation/UDISE)
   - Student info (name, admission no., class, section, parents)
   - Subject table: per-subject obtained / max / percentage / grade / status; with **component breakdown** (Theory, Practical, etc.)
   - Total, overall percentage, overall grade
   - Rank in class / section
   - Attendance summary (auto-pulled for the academic year)
   - Signatures (Class Teacher, Principal — Principal's signature image embedded if uploaded)

### Edge cases handled automatically

- **Withdrawn students**: a red banner across the card — "WITHDRAWN ON 15 Aug 2026 · TC".
- **Mid-session joiners**: an amber banner — "Joined mid-session — some exams marked NA where the student was not enrolled."
- **Co-scholastic subjects**: shown as grade-only rows when the template includes them.

### Customizing the look

Sidebar → **Exams → Report Card Templates**. Three pre-seeded templates:
- **CBSE Standard Report Card** (default) — components, grades, co-scholastic, rank, attendance
- **Simple Report Card** — bare minimum: subject + marks + grade
- **Coaching Performance Card** — highlights rank + percentile, no attendance

To customize: **Clone** the closest match, then edit. The editor has a live preview that updates as you toggle "Show rank", "Show components", etc.

---

## Where Parents and Students See Results

**Who**: Parent or student
**Where**: Their dashboard (sidebar → **My Children** for parents, **Exam Results** for students)

Only exams with `visibleToParent=true AND publishedAt!=null` are returned. They see:
- Per-exam: total obtained, percentage, grade, rank, subject summaries
- FinalResult (annual): paradigm-level rollup, promotion status

---

## Audit Trail

Every meaningful action — marks entered, submitted, locked, unlocked, result computed, result published, report downloaded — is written to `ExamAuditLog` with **before** and **after** snapshots.

**Where to view**: Sidebar → **Exams → Audit Log**.

You can:
- Filter by entity type (Exam, MarksEntry, ExamResult, etc.) and action.
- Filter by exam, student, user, or date range.
- Click any row to expand the JSON before/after diff.
- Export to CSV.

---

## Reports

**Where**: Sidebar → **Exams → Exam List** → click **Results** → **Reports** button (or `/exams/[id]/reports` directly)

Two tabs:

1. **Class summary** — per (class, section): total students, passed, failed, average %, highest/lowest, pass rate. Useful for principal's review.
2. **Subject stats** — per subject: average %, pass rate, top performers, students who need help. Useful for subject teachers.

A third report — **Term comparison** — is available at `/api/school/exams/paradigms/[id]/reports/term-comparison` for tracking individual students across all exams in a paradigm (typically called from the paradigm view).

---

## Permissions Cheat Sheet

| Role | Can do |
|------|--------|
| **SCHOOL_ADMIN** | Everything: create exams, configure, schedule, enter marks for any subject, lock/unlock, compute, publish, manage templates, view audit |
| **TEACHER** | Enter marks only for subjects assigned via `TeacherSubjectAssignment`. Class teachers can **view** all marks of their section but only **edit** their own subjects |
| **STUDENT** | View their own published exam results |
| **PARENT** | View their child's published exam results |

To assign a teacher to a subject: Sidebar → **Exams → Settings → Teacher Subject Assignments** (or via the legacy settings page).

---

## Common Issues & Fixes

| Symptom | Cause | Fix |
|---|---|---|
| Marks grid shows "No subject config found" | Stage 4 not done for this (class, section, subject) | Go to Configure, add the subject |
| Compute button says "No students with marks" | Marks not entered yet | Enter at least one component for one student |
| Publish button says "No computed results to publish" | Stage 7 not done | Click Recompute first |
| Teacher can't edit marks (read-only grid) | No TeacherSubjectAssignment | Admin assigns via settings |
| Parent doesn't see results | Not published, or parent not linked to student | Check the Results page badge; check StudentParent link |
| Report card has empty subject rows | Co-scholastic toggle off in template | Edit template, enable "Include co-scholastic" |

---

## A Concrete Walkthrough — Class 10 Half-Yearly Example

Putting it all together, in order:

1. **Stage 3** — School admin: create exam "Half-Yearly Examination" (HY), group = Term 1, AY = 2026-2027, dates = Sep 15–28. Applies to Class 10. *Status: Draft.*
2. **Stage 4** — Configure subjects:
   - Maths: Theory 80 + Internal 20 = 100
   - Science: Theory 80 + Practical 20 = 100
   - English: Literature 50 + Grammar 30 + Project 20 = 100
3. **Stage 5** — Schedule each paper for a specific date/time/room. *Status: Scheduled.*
4. **Day of exam** — Teachers run the papers and correct them.
5. **Stage 6** — Maths teacher logs in, opens Marks Entry → Class 10 → Section A → Maths. Enters Theory + Internal for 30 students. Hits Submit. Repeats for Section B.
6. Other teachers do their subjects.
7. **Stage 6 (admin)** — Once all teachers are done, admin locks the marks per (class, section, subject) so no further edits.
8. **Stage 7** — Admin clicks **Recompute** on Results page. Engine assigns grades, computes pass/fail, ranks 1–60 across the class. Admin reviews, spots a typo, unlocks Maths Section A, fixes, re-locks, recomputes.
9. **Stage 8** — Principal clicks **Publish**. Status → result_published.
10. **Stage 9** — Class teachers click **Print report cards**. Browser opens the bulk print sheet — they print on school letterhead. Parents also see results in their parent app.

That's the whole cycle. Total elapsed time after the last paper is corrected to the moment parents see results: typically 1–3 working days.
