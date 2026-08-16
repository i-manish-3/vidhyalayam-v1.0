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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  GraduationCap,
  ListChecks,
  ShieldCheck,
  ArrowRight,
  User,
  MapPin,
  Repeat,
  Clock,
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

interface StageTheme {
  section: string
  tile: string
  chip: string
  meta: string
  label: string
  blob: string
}

const STAGE_THEMES: ReadonlyArray<StageTheme> = [
  {
    section:
      'border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10',
    tile: 'from-sky-500 to-cyan-600',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
    meta: 'border-sky-200/80 bg-white/80 dark:border-sky-500/20 dark:bg-background/35',
    label: 'text-sky-700 dark:text-sky-300',
    blob: 'bg-sky-200/35 dark:bg-sky-500/15',
  },
  {
    section:
      'border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:border-teal-500/25 dark:from-teal-500/15 dark:via-card dark:to-emerald-500/10',
    tile: 'from-teal-500 to-emerald-600',
    chip: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
    meta: 'border-teal-200/80 bg-white/80 dark:border-teal-500/20 dark:bg-background/35',
    label: 'text-teal-700 dark:text-teal-300',
    blob: 'bg-teal-200/35 dark:bg-teal-500/15',
  },
  {
    section:
      'border-blue-200/80 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:border-blue-500/25 dark:from-blue-500/15 dark:via-card dark:to-indigo-500/10',
    tile: 'from-blue-500 to-indigo-600',
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    meta: 'border-blue-200/80 bg-white/80 dark:border-blue-500/20 dark:bg-background/35',
    label: 'text-blue-700 dark:text-blue-300',
    blob: 'bg-blue-200/35 dark:bg-blue-500/15',
  },
  {
    section:
      'border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10',
    tile: 'from-violet-500 to-purple-600',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    meta: 'border-violet-200/80 bg-white/80 dark:border-violet-500/20 dark:bg-background/35',
    label: 'text-violet-700 dark:text-violet-300',
    blob: 'bg-violet-200/35 dark:bg-violet-500/15',
  },
  {
    section:
      'border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50 via-white to-pink-50 dark:border-fuchsia-500/25 dark:from-fuchsia-500/15 dark:via-card dark:to-pink-500/10',
    tile: 'from-fuchsia-500 to-pink-600',
    chip: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300',
    meta: 'border-fuchsia-200/80 bg-white/80 dark:border-fuchsia-500/20 dark:bg-background/35',
    label: 'text-fuchsia-700 dark:text-fuchsia-300',
    blob: 'bg-fuchsia-200/35 dark:bg-fuchsia-500/15',
  },
  {
    section:
      'border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10',
    tile: 'from-emerald-500 to-teal-600',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    meta: 'border-emerald-200/80 bg-white/80 dark:border-emerald-500/20 dark:bg-background/35',
    label: 'text-emerald-700 dark:text-emerald-300',
    blob: 'bg-emerald-200/35 dark:bg-emerald-500/15',
  },
  {
    section:
      'border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10',
    tile: 'from-amber-500 to-orange-600',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    meta: 'border-amber-200/80 bg-white/80 dark:border-amber-500/20 dark:bg-background/35',
    label: 'text-amber-700 dark:text-amber-300',
    blob: 'bg-amber-200/35 dark:bg-amber-500/15',
  },
  {
    section:
      'border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-rose-50 dark:border-orange-500/25 dark:from-orange-500/15 dark:via-card dark:to-rose-500/10',
    tile: 'from-orange-500 to-rose-600',
    chip: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    meta: 'border-orange-200/80 bg-white/80 dark:border-orange-500/20 dark:bg-background/35',
    label: 'text-orange-700 dark:text-orange-300',
    blob: 'bg-orange-200/35 dark:bg-orange-500/15',
  },
  {
    section:
      'border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-red-50 dark:border-rose-500/25 dark:from-rose-500/15 dark:via-card dark:to-red-500/10',
    tile: 'from-rose-500 to-red-600',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    meta: 'border-rose-200/80 bg-white/80 dark:border-rose-500/20 dark:bg-background/35',
    label: 'text-rose-700 dark:text-rose-300',
    blob: 'bg-rose-200/35 dark:bg-rose-500/15',
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

const WALKTHROUGH_STEPS: ReadonlyArray<string> = [
  'Admin creates exam "Half-Yearly Examination" (HY), Term 1, dates Sep 15–28, Class 10.',
  'Admin configures Maths (Theory 80 + Internal 20), Science (Theory 80 + Practical 20), English (Lit 50 + Gr 30 + Project 20).',
  'Admin sets the schedule — each paper a specific date/time/room.',
  'Teachers run papers, correct them.',
  'Maths teacher: Marks Entry → Class 10 → Section A → Maths. Enters marks for 30 students. Submit. Repeats per section.',
  'All teachers finish. Admin locks the marks per (class, section, subject).',
  'Admin: Results page → Recompute. Engine assigns A1/A2/B1 etc., ranks 1–60.',
  'Admin spots a typo → unlock → fix → re-lock → recompute.',
  'Principal: Results page → Publish.',
  'Class teachers: Print report cards → browser opens 60 cards → print.',
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
          <Button variant="outline" size="sm" className="gap-1.5 text-foreground">
            <HelpCircle className="size-3.5" />
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-indigo-500/20 bg-card p-0 shadow-2xl shadow-indigo-500/15 sm:max-w-2xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#4f46e5_0%,#7c3aed_48%,#db2777_100%)] px-5 py-4 pr-12 text-white sm:px-6">
          <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
          <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-indigo-300/20 blur-2xl" />
          <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-fuchsia-300/15 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
              <GraduationCap className="size-5 text-white" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold tracking-normal text-white">Exam Module — End-to-End Guide</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-white/75">
                The full exam workflow — pattern, terms, exam, schedule, marks, results, publish, report cards.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-indigo-500/[0.04] via-background to-fuchsia-500/[0.05] p-4 sm:p-5">
          {/* Pipeline at a glance */}
          <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
            <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm"><ListChecks className="size-4 text-white" /></span>
              <div><h3 className="text-sm font-semibold">The 9 steps at a glance</h3><p className="text-[10px] text-muted-foreground">The full pipeline from pattern setup to printed report cards</p></div>
            </div>
            <div className="relative grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {STAGES.map((s) => (
                <div key={s.num} className="flex items-center gap-2 rounded-lg border border-sky-200/80 bg-white/80 px-2.5 py-2 shadow-sm dark:border-sky-500/20 dark:bg-background/35">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-cyan-600 text-[10px] font-bold text-white">{s.num}</span>
                  <span className="truncate text-[11px] font-semibold">{s.title}</span>
                </div>
              ))}
            </div>
            <p className="relative mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground sm:justify-start sm:text-left">
              <ListChecks className="size-3 text-sky-500" />
              Steps 1–5 are <strong>setup</strong> (once per exam). Steps 6–9 are <strong>operations</strong> (every exam cycle).
            </p>
          </section>

          {/* Stages in detail */}
          {STAGES.map((s) => {
            const Icon = s.icon
            const t = STAGE_THEMES[s.num - 1]
            return (
              <section key={s.num} className={`relative overflow-hidden rounded-xl border ${t.section} p-4 shadow-sm`}>
                <div aria-hidden className={`absolute -right-7 -top-10 size-28 rounded-full ${t.blob} blur-xl`} />
                <div className="relative mb-3 flex items-center gap-2">
                  <span className={`flex size-8 items-center justify-center rounded-lg bg-gradient-to-br ${t.tile} text-white shadow-sm`}><Icon className="size-4 text-white" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{s.title}</h3>
                      <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold tracking-wide ${t.chip}`}>STAGE {s.num}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{s.who} · {s.where}</p>
                  </div>
                </div>
                <p className="relative text-xs text-muted-foreground">{s.description}</p>
                <div className="relative mt-3 grid gap-1.5 sm:grid-cols-3">
                  <div className={`rounded-lg border ${t.meta} px-3 py-2 shadow-sm`}>
                    <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase ${t.label}`}>
                      <User className="size-3" /> Who
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold">{s.who}</p>
                  </div>
                  <div className={`rounded-lg border ${t.meta} px-3 py-2 shadow-sm`}>
                    <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase ${t.label}`}>
                      <MapPin className="size-3" /> Where
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold">{s.where}</p>
                  </div>
                  <div className={`rounded-lg border ${t.meta} px-3 py-2 shadow-sm`}>
                    <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase ${t.label}`}>
                      <Repeat className="size-3" /> Frequency
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-snug">{s.frequency}</p>
                  </div>
                </div>
                <ol className="relative mt-3 space-y-1.5">
                  {s.steps.map((step, i) => (
                    <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                      <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${t.tile} text-[9px] font-bold text-white`}>{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                {s.tip && (
                  <p className="relative mt-3 flex items-start gap-2 rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-200">
                    <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
                    <span><strong>Tip:</strong> {s.tip}</span>
                  </p>
                )}
              </section>
            )
          })}

          {/* Who can do what */}
          <section className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm"><ShieldCheck className="size-4 text-white" /></span>
              <div><h3 className="text-sm font-semibold">Who can do what</h3><p className="text-[10px] text-muted-foreground">Role-based access across the exam module</p></div>
            </div>
            <div className="space-y-1.5">
              {ROLE_PERMS.map((r) => (
                <div key={r.role} className="flex flex-col gap-1.5 rounded-lg border border-violet-200/80 bg-white/80 px-3 py-2 shadow-sm sm:flex-row sm:items-center sm:gap-3 dark:border-violet-500/20 dark:bg-background/35">
                  <span className="w-fit shrink-0 rounded-md border border-violet-200/80 bg-violet-50 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300">{r.role}</span>
                  <p className="text-xs text-muted-foreground">{r.can}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Troubleshooting */}
          <section className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm"><AlertCircle className="size-4 text-white" /></span>
              <div><h3 className="text-sm font-semibold">Common issues</h3><p className="text-[10px] text-muted-foreground">Fast fixes for what usually goes wrong</p></div>
            </div>
            <div className="space-y-1.5">
              {TROUBLESHOOTING.map((t) => (
                <div key={t.symptom} className="rounded-lg border border-amber-200/80 bg-white/80 px-3 py-2 shadow-sm dark:border-amber-500/20 dark:bg-background/35">
                  <div className="flex items-start gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{t.symptom}</span>
                  </div>
                  <p className="mt-1 flex items-start gap-2 pl-5 text-xs text-muted-foreground">
                    <ArrowRight className="mt-0.5 size-3 shrink-0" />
                    <span>{t.fix}</span>
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Concrete walkthrough */}
          <section className="relative overflow-hidden rounded-xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4 shadow-sm dark:border-indigo-500/25 dark:from-indigo-500/15 dark:via-card dark:to-violet-500/10">
            <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-indigo-200/35 blur-xl dark:bg-indigo-500/15" />
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm"><Lightbulb className="size-4 text-white" /></span>
              <div><h3 className="text-sm font-semibold">Concrete Walkthrough</h3><p className="text-[10px] text-muted-foreground">Class 10 Half-Yearly — end to end</p></div>
            </div>
            <ol className="relative space-y-1.5">
              {WALKTHROUGH_STEPS.map((step, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[9px] font-bold text-white">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="relative mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] font-medium text-indigo-700 sm:justify-start sm:text-left dark:text-indigo-300">
              <Clock className="size-3" />
              Typical elapsed time: paper correction → parents see results = 1–3 working days.
            </p>
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
          <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
