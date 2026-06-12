'use client'

/**
 * Reusable end-to-end guide for the Exam Module. Opens a modal with the full
 * 9-stage pipeline. Mirrors `docs/EXAM_MODULE_USER_GUIDE.md` so anyone
 * stuck on a step gets the same answer in the app as in the docs.
 *
 * Usage:
 *   <ExamInstructionsButton />
 * Renders a small "How it works" button; click → modal.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Layers,
  CalendarRange,
  ClipboardList,
  Settings2,
  Calendar as CalIcon,
  ClipboardCheck,
  Calculator,
  Send,
  Printer,
  HelpCircle,
  AlertCircle,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react'

interface StageDef {
  num: number
  title: string
  who: string
  where: string
  frequency: string
  icon: LucideIcon
  description: string
  steps: ReadonlyArray<string>
  tip?: string
}

const STAGES: ReadonlyArray<StageDef> = [
  {
    num: 1,
    title: 'Exam Pattern',
    who: 'School admin',
    where: 'Exams → Exam Patterns',
    frequency: 'Once per academic year (pre-seeded)',
    icon: Layers,
    description:
      "Your school's overall exam framework for the year — CBSE term pattern, state-board annual, or coaching test series. Defines how exams combine into the final result.",
    steps: [
      'The default exam pattern is already created during onboarding.',
      'Review aggregation rule (how Term 1 + Term 2 combine) and passing rule (33% / 5 grace marks).',
      'You almost never need to touch this.',
    ],
  },
  {
    num: 2,
    title: 'Terms',
    who: 'School admin',
    where: 'Exam Patterns → click the pattern → Terms',
    frequency: 'Once per academic year',
    icon: CalendarRange,
    description:
      'Buckets inside an exam pattern. CBSE schools have Term 1 + Term 2 (50% weight each). Coaching centers have Test Series 1, 2, 3.',
    steps: [
      'Default terms are already created.',
      'Each term has a weight — that drives the final aggregation.',
    ],
  },
  {
    num: 3,
    title: 'Create an Exam',
    who: 'School admin',
    where: 'Exam List → + New exam',
    frequency: 'Each new exam (Unit Test, Half-Yearly, Annual, etc.)',
    icon: ClipboardList,
    description:
      'Actual exam events live here. Each exam belongs to a term and runs for one or more classes.',
    steps: [
      'Click + New exam.',
      'Fill name, short code, term, academic year, type (written/practical/oral), dates.',
      'Pick which classes this exam applies to.',
      'Save. Status starts at Draft.',
    ],
  },
  {
    num: 4,
    title: 'Configure Subjects + Components',
    who: 'School admin',
    where: 'Exam List → click Configure',
    frequency: 'Once per exam (only when pattern changes)',
    icon: Settings2,
    description:
      'Defines what each (class × subject) exam looks like. Total marks, passing marks, grace marks, and the component split (Theory 80 + Practical 20, etc.).',
    steps: [
      'Click + Add subject for each (class, subject) row.',
      'Set component split — component marks MUST sum to subject total (the page enforces this).',
      'For co-scholastic subjects (Discipline, Art) toggle "Grade only".',
      'Status moves Draft → Scheduled when subjects are configured.',
    ],
    tip: 'If a subject pattern repeats across classes, copy a row instead of re-entering.',
  },
  {
    num: 5,
    title: 'Schedule Papers',
    who: 'School admin / exam coordinator',
    where: 'Exam List → click Schedule',
    frequency: 'Once per exam',
    icon: CalIcon,
    description:
      'The exam timetable — dates, times, rooms, invigilators. The page detects conflicts automatically.',
    steps: [
      'Fill in each subject row with date, time, room, invigilator.',
      'Conflicts show as red warnings — fix before saving.',
      'Status moves to Ongoing once the start date passes.',
    ],
    tip: 'Download admit cards from this page (one per student, signed QR code).',
  },
  {
    num: 6,
    title: 'Enter Marks',
    who: 'Subject teacher (mainly), class teacher (read-all), admin (override)',
    where: 'Exam List → click anywhere on row OR green "Enter marks" button',
    frequency: 'After each paper is corrected',
    icon: ClipboardCheck,
    description:
      'The day-to-day grid: one row per student, one column per component. Filter by Class → Section → Subject.',
    steps: [
      'Pick Class, Section, Subject from filter bar.',
      'Type a number in any cell — auto-saves 1.5s after you stop typing.',
      'Use status dropdown (Present / Absent / ML / NA) for non-numeric cases.',
      'Click Submit when done. Admin clicks Lock to freeze the subject.',
    ],
    tip:
      'Teachers can only edit subjects they are assigned to (TeacherSubjectAssignment). Class teachers can view all marks of their section.',
  },
  {
    num: 7,
    title: 'Compute Results',
    who: 'School admin',
    where: 'Exam List → click Results → Recompute',
    frequency: 'After all marks are locked',
    icon: Calculator,
    description:
      'Pure computation. The engine builds subject summaries, applies grace where eligible, resolves grades from the band, computes pass/fail, and assigns class/section ranks.',
    steps: [
      'Click Recompute. Engine runs in seconds.',
      'Page reloads with stat cards (Total / Passed / Failed / Average) + ranked table.',
      'Recompute as many times as needed — results are stable until you do.',
    ],
    tip: 'Tweak a mark in marks-entry → unlock → fix → re-lock → recompute. Each step writes an audit row.',
  },
  {
    num: 8,
    title: 'Publish to Parents',
    who: 'Principal / school admin (requires exam:publish)',
    where: 'Results page → Publish button',
    frequency: 'When results are reviewed and ready',
    icon: Send,
    description:
      'Before publish, results are admin-only. Parents/students see nothing. After publish, they can view the result and download the report card.',
    steps: [
      'Header badge says DRAFT before publish.',
      'Click Publish. System sets visibleToParent=true and stamps publishedAt + publishedBy.',
      'Badge changes to PUBLISHED · visible to parents.',
      'Need to fix? Click Unpublish — reason required, recorded in audit log.',
    ],
  },
  {
    num: 9,
    title: 'Print Report Cards',
    who: 'School admin / results role (requires exam:results)',
    where: 'Results page → Print report cards',
    frequency: 'After publish',
    icon: Printer,
    description:
      'One A4 portrait card per student, formatted with school header, subjects table, totals, rank, attendance, signatures.',
    steps: [
      'Click Print report cards. New tab opens with one card per student.',
      'Hit Ctrl+P or the Print button. Browser "Save as PDF" works as the download path.',
      'Withdrawn students get a red banner. Mid-session joiners get an amber banner.',
    ],
    tip:
      "Customize via Exams → Report Card Templates. Clone the closest match, edit with live preview, then it's available to print.",
  },
]

const ROLE_PERMS: ReadonlyArray<{ role: string; can: string }> = [
  {
    role: 'SCHOOL_ADMIN',
    can: 'Everything — create exams, configure, schedule, enter marks, lock/unlock, compute, publish, manage templates, view audit',
  },
  {
    role: 'TEACHER',
    can: 'Enter marks ONLY for subjects assigned via TeacherSubjectAssignment. Class teachers view all marks of their section.',
  },
  { role: 'STUDENT', can: 'View own published exam results.' },
  { role: 'PARENT', can: "View child's published exam results." },
]

const TROUBLESHOOTING: ReadonlyArray<{ symptom: string; fix: string }> = [
  {
    symptom: 'Marks grid shows "No subject config found"',
    fix: 'Go to Configure, add the subject for that (class, section).',
  },
  {
    symptom: 'Compute button says "No students with marks"',
    fix: 'Enter at least one component for one student first.',
  },
  {
    symptom: 'Publish button says "No computed results to publish"',
    fix: 'Click Recompute first on the Results page.',
  },
  {
    symptom: "Teacher can't edit marks (read-only grid)",
    fix: 'Admin needs to assign the teacher via Teacher Subject Assignments.',
  },
  {
    symptom: "Parent doesn't see results",
    fix: 'Confirm exam is published. Confirm parent → student link exists.',
  },
  {
    symptom: 'Report card has empty subject rows',
    fix: 'Edit the template, enable "Include co-scholastic" if those rows are grade-only.',
  },
]

interface Props {
  /** Optional override for the trigger button label. Default: "How it works" */
  triggerLabel?: string
  /** Render as a ghost-style icon button instead of a labeled button */
  iconOnly?: boolean
}

export function ExamInstructionsButton({ triggerLabel = 'How it works', iconOnly = false }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {iconOnly ? (
          <Button variant="ghost" size="icon" className="size-9" aria-label="How exams work">
            <HelpCircle className="size-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5">
            <HelpCircle className="size-3.5" />
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0 sm:max-w-[80vw]">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="text-xl">Exam Module — End-to-End Guide</DialogTitle>
        </DialogHeader>

        <div className="max-h-[calc(90vh-5.5rem)] overflow-y-auto p-6 text-sm">
          {/* Pipeline diagram */}
          <section className="mb-7">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              The 9 steps from start to finish
            </h3>
            <div className="rounded-md border bg-muted/30 p-4 font-mono text-sm leading-relaxed">
              <div>1. <strong>Exam Pattern</strong> ─────────── done once per year</div>
              <div>2. <strong>Term</strong> ─────────────────── inside the exam pattern</div>
              <div>3. <strong>Exam</strong> ─────────────────── Half-Yearly, Unit Test, etc.</div>
              <div>4. <strong>Subject Config + Components</strong> Theory 80 + Practical 20</div>
              <div>5. <strong>Schedule</strong> ─────────────── dates, rooms, invigilators</div>
              <div>6. <strong>Marks Entry</strong> ────────── per student, per component</div>
              <div>7. <strong>Compute Results</strong> ────── engine assigns grades + ranks</div>
              <div>8. <strong>Publish</strong> ────────────── parents/students can view</div>
              <div>9. <strong>Print Report Cards</strong> ── A4 portrait, one per student</div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Steps 1–5 are <strong>setup</strong> (once per exam). Steps 6–9 are <strong>operations</strong> (every exam cycle).
            </p>
          </section>

          {/* Per-stage */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Stages in detail
            </h3>
            {STAGES.map((s) => {
              const Icon = s.icon
              return (
                <div key={s.num} className="rounded-md border bg-card">
                  <div className="flex items-start gap-3 border-b bg-muted/30 px-4 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          STAGE {s.num}
                        </Badge>
                        <h4 className="text-base font-semibold">{s.title}</h4>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                    </div>
                  </div>
                  <div className="space-y-3 px-4 py-3">
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <Meta label="Who" value={s.who} />
                      <Meta label="Where" value={s.where} />
                      <Meta label="Frequency" value={s.frequency} />
                    </div>
                    <ol className="ml-5 list-decimal space-y-1 text-sm">
                      {s.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                    {s.tip && (
                      <div className="flex items-start gap-2 rounded border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        <Lightbulb className="mt-0.5 size-4 shrink-0" />
                        <span>
                          <strong>Tip:</strong> {s.tip}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </section>

          {/* Permissions */}
          <section className="mt-7">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Who can do what
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Can do</th>
                </tr>
              </thead>
              <tbody>
                {ROLE_PERMS.map((r) => (
                  <tr key={r.role} className="border-b">
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        {r.role}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{r.can}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Troubleshooting */}
          <section className="mt-7">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <AlertCircle className="size-4" /> Common issues
            </h3>
            <div className="space-y-2">
              {TROUBLESHOOTING.map((t) => (
                <div key={t.symptom} className="rounded border bg-card px-3 py-2 text-sm">
                  <div className="font-medium">{t.symptom}</div>
                  <div className="mt-0.5 text-muted-foreground">→ {t.fix}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Concrete walkthrough */}
          <section className="mt-7 rounded-md border border-primary/30 bg-primary/5 p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
              Concrete walkthrough — Class 10 Half-Yearly
            </h3>
            <ol className="ml-5 list-decimal space-y-1.5 text-sm">
              <li>Admin creates exam &ldquo;Half-Yearly Examination&rdquo; (HY), Term 1, dates Sep 15–28, Class 10.</li>
              <li>Admin configures Maths (Theory 80 + Internal 20), Science (Theory 80 + Practical 20), English (Lit 50 + Gr 30 + Project 20).</li>
              <li>Admin sets the schedule — each paper a specific date/time/room.</li>
              <li>Teachers run papers, correct them.</li>
              <li>Maths teacher: Marks Entry → Class 10 → Section A → Maths. Enters marks for 30 students. Submit. Repeats per section.</li>
              <li>All teachers finish. Admin locks the marks per (class, section, subject).</li>
              <li>Admin: Results page → Recompute. Engine assigns A1/A2/B1 etc., ranks 1–60.</li>
              <li>Admin spots a typo → unlock → fix → re-lock → recompute.</li>
              <li>Principal: Results page → Publish.</li>
              <li>Class teachers: Print report cards → browser opens 60 cards → print.</li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">
              Typical elapsed time: paper correction → parents see results = 1–3 working days.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm text-foreground">{value}</div>
    </div>
  )
}
