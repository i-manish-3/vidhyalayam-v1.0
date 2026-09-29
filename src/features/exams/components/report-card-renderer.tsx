/**
 * Pure React component that turns a `ReportCardData` shape into printable
 * HTML. Faithfully styles the report card according to the school's fee receipt
 * print header and modern academic progress report design with vibrant color
 * tokens, student photo frame, attendance card, high-contrast marks table,
 * and official signatures.
 */

import { cn } from '@/lib/utils'
import type { ReportCardData } from '@/features/exams/lib/report-card-generator'
import { useAppStore } from '@/lib/store'
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  Percent,
  Star,
  Trophy,
  UserCheck,
  UserX,
  XCircle,
} from 'lucide-react'

interface Props {
  data: ReportCardData
  className?: string
  showHeaderBanner?: boolean
}

function resolveAttendanceStatusBadge(pct: number): { label: string; cls: string } {
  if (pct >= 85) return { label: 'Excellent', cls: 'bg-emerald-600 text-white' }
  if (pct >= 75) return { label: 'Good', cls: 'bg-teal-600 text-white' }
  if (pct >= 60) return { label: 'Average', cls: 'bg-amber-600 text-white' }
  return { label: 'Poor', cls: 'bg-[#0a4d8c] text-white' }
}

export function ReportCardRenderer({ data, className, showHeaderBanner }: Props) {
  const currentSchool = useAppStore((state) => state.currentSchool)
  const {
    school,
    examMeta,
    studentFields,
    subjects,
    totals,
    attendance,
    promotion,
    signatures,
    options,
    lifecycle,
    studentPhoto,
    studentDetails,
    division,
    remarks,
  } = data

  const isBannerAllowed =
    showHeaderBanner !== undefined
      ? showHeaderBanner
      : options.showPrintHeader !== false

  const headerBanner = isBannerAllowed
    ? (school.printHeader && school.printHeader.trim()) ||
      (currentSchool?.printHeader && currentSchool.printHeader.trim()) ||
      null
    : null

  const isMultiExam = Boolean(data.selectedExams && data.selectedExams.length > 1)
  const selectedExams = data.selectedExams ?? []

  // Component columns for single-exam breakdown
  const componentColumns: string[] =
    !isMultiExam && options.showComponents
      ? Array.from(new Set(subjects.flatMap((s) => s.components.map((c) => c.name))))
      : []

  // Extract student details for canonical fields, falling back to studentFields lookup
  const getFieldVal = (key: string) => studentFields.find((f) => f.key === key)?.value || '—'
  const studentName = studentDetails?.name || getFieldVal('name')
  const rollNumber = studentDetails?.rollNumber || getFieldVal('rollNumber')
  const fatherName = studentDetails?.fatherName || getFieldVal('fatherName')
  const motherName = studentDetails?.motherName || getFieldVal('motherName')
  const classVal = studentDetails?.className || getFieldVal('class')
  const secVal = studentDetails?.sectionName || getFieldVal('section')
  const classSection =
    studentDetails?.className && studentDetails?.sectionName
      ? `${studentDetails.className} - ${studentDetails.sectionName}`
      : [classVal, secVal].filter((v) => v && v !== '—').join(' - ') || '—'
  const academicSession =
    studentDetails?.academicSession ||
    examMeta.academicYear ||
    school.academicYear ||
    getFieldVal('academicYear')
  const admissionNumber = studentDetails?.admissionNumber || getFieldVal('admissionNumber')

  // Attendance metrics
  const totalDays = attendance?.totalDays ?? 0
  const presentDays = attendance?.presentDays ?? 0
  const absentDays = attendance ? Math.max(0, attendance.totalDays - attendance.presentDays) : 0
  const attendancePct = attendance?.percentage ?? 0
  const attendanceStatus = resolveAttendanceStatusBadge(attendancePct)

  // Status & remarks
  const isPass = totals.status === 'pass' || totals.status === 'promoted'
  const displayDivision = division || (isPass ? '1st Division' : 'Fail')
  const displayRemarks = promotion?.remarks || remarks || (isPass ? 'GOOD' : 'NEEDS IMPROVEMENT')

  return (
    <div
      style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
      className={cn(
        'report-card-page relative mx-auto w-full max-w-[210mm] bg-white font-sans text-[11px] leading-tight text-gray-900 shadow-md print:max-w-none print:shadow-none',
        className,
      )}
    >
      {/* Decorative Outer Border / Wave Frame */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-sky-400/90 bg-white p-3 sm:p-5">
        {/* Top Decorative Flourish SVGs (only shown if not using full-width print banner) */}
        {!headerBanner && (
          <>
            <div className="pointer-events-none absolute -top-4 -right-4 h-28 w-44 opacity-80 print:opacity-100">
              <svg viewBox="0 0 180 120" fill="none" className="size-full">
                <path
                  d="M0,0 C60,40 120,20 180,60 L180,0 Z"
                  fill="url(#topWaveGrad)"
                />
                <path
                  d="M30,0 C80,35 130,15 180,45 L180,0 Z"
                  fill="#38bdf8"
                  fillOpacity="0.3"
                />
                <defs>
                  <linearGradient id="topWaveGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#0284c7" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.3" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <div className="pointer-events-none absolute -top-4 -left-4 h-24 w-36 opacity-75 print:opacity-100">
              <svg viewBox="0 0 150 100" fill="none" className="size-full">
                <path
                  d="M0,0 L0,50 C40,20 90,40 150,0 Z"
                  fill="url(#topLeftGrad)"
                />
                <defs>
                  <linearGradient id="topLeftGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#0369a1" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.15" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </>
        )}

        {/* ============================================================== */}
        {/* 1. SCHOOL HEADER (Matches Fee Receipt Banner / Fallback)       */}
        {/* ============================================================== */}
        <header className="relative z-10 mb-2">
          {headerBanner ? (
            <div className="-mx-3 -mt-3 sm:-mx-5 sm:-mt-5 overflow-hidden rounded-t-xl border-b border-sky-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={headerBanner}
                alt={school.name}
                className="block w-full h-auto object-contain"
              />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 px-1 py-1">
              {/* Left School Logo */}
              {options.showLogo && school.logo ? (
                <div className="flex shrink-0 items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={school.logo}
                    alt={school.name}
                    className="size-16 object-contain sm:size-20"
                  />
                </div>
              ) : (
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0a4d8c] to-[#0284c7] text-white shadow-xs">
                  <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                    <path d="M6 12v5c3 3 9 3 12 0v-5" />
                  </svg>
                </div>
              )}

              {/* Center School Details */}
              <div className="flex-1 text-center">
                <h1 className="font-serif text-xl font-extrabold uppercase tracking-wide text-[#0a3f75] sm:text-2xl md:text-3xl">
                  {school.name}
                </h1>
                {options.showAddress && school.address && (
                  <p className="mt-0.5 text-[11px] font-medium text-slate-700">
                    {school.address}
                  </p>
                )}
                {/* Tagline / Motto Row */}
                <div className="mt-1 flex items-center justify-center gap-2 text-[10px] font-semibold text-sky-800">
                  <span className="h-px w-8 bg-sky-300" />
                  <span>Learn  •  Grow  •  Build a Better Tomorrow</span>
                  <span className="h-px w-8 bg-sky-300" />
                </div>
                {(options.showAffiliation && school.affiliation) || school.board || school.udise ? (
                  <p className="mt-0.5 text-[9px] text-slate-500">
                    {school.board ? `Affiliated to ${school.board}` : null}
                    {options.showAffiliation && school.affiliation
                      ? ` · Affiliation No: ${school.affiliation}`
                      : null}
                    {school.udise ? ` · UDISE: ${school.udise}` : null}
                  </p>
                ) : null}
              </div>

              {/* Right Decorative Badge */}
              <div className="flex w-20 shrink-0 flex-col items-center justify-center text-center">
                <div className="font-serif text-[11px] font-extrabold italic leading-tight text-sky-800">
                  Bright<br />Future<br />Together
                </div>
                <svg
                  className="mt-0.5 size-5 text-sky-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                  <path d="M6 6h10" />
                  <path d="M6 10h10" />
                </svg>
              </div>
            </div>
          )}
        </header>

        {/* ============================================================== */}
        {/* 2. TITLE PILL & SESSION BADGE                                  */}
        {/* ============================================================== */}
        <div className="relative z-10 flex flex-col items-center justify-center pb-2 pt-1 text-center">
          <div className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#0d69ac] via-[#107bbb] to-[#2cb28d] px-8 py-1.5 text-center text-xs font-black tracking-widest text-white shadow-sm sm:text-sm uppercase">
            {data.title || 'ACADEMIC PROGRESS REPORT'}
          </div>
          <div className="mt-1.5 inline-flex items-center justify-center rounded-full bg-[#094178] px-6 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-2xs sm:text-[11px]">
            Session : {academicSession || '2025-2026'}
          </div>
        </div>

        {/* Lifecycle alert if applicable */}
        {lifecycle.withdrawnOn ? (
          <div className="my-2 rounded-lg border border-red-300 bg-red-50 py-1 text-center text-xs font-bold text-red-700">
            WITHDRAWN ON {lifecycle.withdrawnOn}
            {lifecycle.withdrawalReason ? ` · ${lifecycle.withdrawalReason}` : ''}
          </div>
        ) : lifecycle.joinedMidSession ? (
          <div className="my-2 rounded-lg border border-amber-300 bg-amber-50 py-1 text-center text-xs font-medium text-amber-800">
            Joined mid-session — exams before admission date are not graded.
          </div>
        ) : null}

        {/* ============================================================== */}
        {/* 3. STUDENT INFO CARD (With Photo Frame on Right)               */}
        {/* ============================================================== */}
        <section className="relative z-10 my-2.5 rounded-2xl border border-sky-300 bg-sky-50/20 p-3 shadow-2xs sm:p-4">
          <div className="flex flex-row items-center justify-between gap-3">
            {/* Left 2-Column Key/Value Grid */}
            <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-2 text-[11px] sm:grid-cols-2">
              <div className="flex items-baseline">
                <span className="w-28 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-sky-950 sm:w-32">
                  STUDENT NAME
                </span>
                <span className="mr-1.5 font-bold text-sky-950">:</span>
                <span className="font-bold uppercase text-slate-900">{studentName}</span>
              </div>

              <div className="flex items-baseline">
                <span className="w-28 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-sky-950 sm:w-32">
                  ROLL NUMBER
                </span>
                <span className="mr-1.5 font-bold text-sky-950">:</span>
                <span className="font-bold text-slate-900">{rollNumber || '—'}</span>
              </div>

              <div className="flex items-baseline">
                <span className="w-28 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-sky-950 sm:w-32">
                  FATHER&apos;S NAME
                </span>
                <span className="mr-1.5 font-bold text-sky-950">:</span>
                <span className="font-semibold uppercase text-slate-800">{fatherName || '—'}</span>
              </div>

              <div className="flex items-baseline">
                <span className="w-28 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-sky-950 sm:w-32">
                  MOTHER&apos;S NAME
                </span>
                <span className="mr-1.5 font-bold text-sky-950">:</span>
                <span className="font-semibold uppercase text-slate-800">{motherName || '—'}</span>
              </div>

              <div className="flex items-baseline">
                <span className="w-28 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-sky-950 sm:w-32">
                  CLASS &amp; SECTION
                </span>
                <span className="mr-1.5 font-bold text-sky-950">:</span>
                <span className="font-bold uppercase text-slate-900">{classSection || '—'}</span>
              </div>

              <div className="flex items-baseline">
                <span className="w-28 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-sky-950 sm:w-32">
                  ACADEMIC SESSION
                </span>
                <span className="mr-1.5 font-bold text-sky-950">:</span>
                <span className="font-semibold text-slate-800">{academicSession || '—'}</span>
              </div>

              {admissionNumber && admissionNumber !== '—' && (
                <div className="flex items-baseline">
                  <span className="w-28 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-sky-950 sm:w-32">
                    ADMISSION NO.
                  </span>
                  <span className="mr-1.5 font-bold text-sky-950">:</span>
                  <span className="font-semibold text-slate-800">{admissionNumber}</span>
                </div>
              )}
            </div>

            {/* Right Student Photo Box */}
            <div className="flex shrink-0 flex-col items-center justify-center">
              <div className="flex size-20 flex-col items-center justify-center rounded-xl border-2 border-dashed border-sky-300 bg-white/80 p-1 text-center shadow-2xs sm:h-24 sm:w-24">
                {studentPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={studentPhoto}
                    alt="Student"
                    className="size-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-sky-600/80">
                    <Camera className="size-5 text-sky-500" strokeWidth={1.5} />
                    <span className="mt-1 text-[8px] font-bold leading-tight text-sky-800">
                      Photo Not<br />Available
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 4. ATTENDANCE SUMMARY CARD                                     */}
        {/* ============================================================== */}
        {options.showAttendance && (
          <section className="relative z-10 my-2.5 rounded-2xl border border-emerald-300 bg-emerald-50/20 p-2.5 shadow-2xs">
            <div className="flex items-center justify-center gap-1.5 pb-2 text-[10px] font-extrabold tracking-wider text-emerald-900 uppercase sm:text-[11px]">
              <CalendarDays className="size-4 text-emerald-700" />
              <span>
                ATTENDANCE {totalDays > 0 ? `(LAST ${totalDays} DAYS)` : ''}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {/* PRESENT */}
              <div className="rounded-xl border border-emerald-200 bg-white p-1.5 shadow-2xs">
                <div className="flex items-center justify-center gap-1 text-[9px] font-bold text-emerald-700 uppercase">
                  <UserCheck className="size-3 text-emerald-600" />
                  <span>PRESENT</span>
                </div>
                <div className="mt-0.5 text-base font-black text-emerald-600 tabular-nums sm:text-lg">
                  {presentDays}
                </div>
              </div>

              {/* ABSENT */}
              <div className="rounded-xl border border-rose-200 bg-white p-1.5 shadow-2xs">
                <div className="flex items-center justify-center gap-1 text-[9px] font-bold text-rose-700 uppercase">
                  <UserX className="size-3 text-rose-600" />
                  <span>ABSENT</span>
                </div>
                <div className="mt-0.5 text-base font-black text-rose-600 tabular-nums sm:text-lg">
                  {absentDays}
                </div>
              </div>

              {/* % */}
              <div className="rounded-xl border border-amber-200 bg-white p-1.5 shadow-2xs">
                <div className="flex items-center justify-center gap-1 text-[9px] font-bold text-amber-700 uppercase">
                  <Percent className="size-3 text-amber-600" />
                  <span>%</span>
                </div>
                <div className="mt-0.5 text-base font-black text-amber-600 tabular-nums sm:text-lg">
                  {attendance ? `${Math.round(attendancePct)}%` : '0%'}
                </div>
              </div>

              {/* STATUS */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-sky-200 bg-white p-1.5 shadow-2xs">
                <div className="text-[9px] font-bold text-sky-900 uppercase">
                  STATUS
                </div>
                <div className="mt-0.5">
                  <span
                    className={cn(
                      'inline-block rounded-full px-3 py-0.5 text-[9px] font-extrabold tracking-wide sm:text-[10px]',
                      attendanceStatus.cls,
                    )}
                  >
                    {attendanceStatus.label}
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ============================================================== */}
        {/* 5. ACADEMIC MARKS TABLE (Deep Navy Header, Clean Rows)         */}
        {/* ============================================================== */}
        <section className="relative z-10 my-3 overflow-hidden rounded-xl border border-sky-300 shadow-2xs">
          <table className="w-full border-collapse text-[10px] sm:text-[11px]">
            {/* Table Header */}
            <thead>
              <tr className="bg-[#0a4d8c] text-white">
                <th className="px-3 py-2 text-left font-black tracking-wider uppercase">
                  SUBJECT
                </th>
                <th className="px-2 py-2 text-center font-bold tracking-wider uppercase">
                  FULL MARKS
                </th>
                <th className="px-2 py-2 text-center font-bold tracking-wider uppercase">
                  PASS MARKS
                </th>
                <th className="px-2 py-2 text-center font-bold tracking-wider uppercase">
                  HIGHEST
                </th>

                {/* Dynamic Columns: Multi-Exam vs Single-Exam Component Breakdown */}
                {isMultiExam ? (
                  selectedExams.map((e) => (
                    <th
                      key={e.examId}
                      className="border-l border-white/20 px-2 py-2 text-center font-bold tracking-wider uppercase"
                    >
                      <div>{e.shortCode || e.examName}</div>
                      {e.maxMarks != null && e.maxMarks > 0 && (
                        <div className="text-[8px] font-normal text-sky-200">
                          Max: {e.maxMarks}
                        </div>
                      )}
                    </th>
                  ))
                ) : componentColumns.length > 0 ? (
                  componentColumns.map((col) => (
                    <th
                      key={col}
                      className="border-l border-white/20 px-2 py-2 text-center font-bold tracking-wider uppercase"
                    >
                      {col}
                    </th>
                  ))
                ) : (
                  <th className="border-l border-white/20 px-2 py-2 text-center font-bold tracking-wider uppercase">
                    THEORY
                  </th>
                )}

                <th className="border-l border-white/20 px-3 py-2 text-center font-black tracking-wider uppercase">
                  TOTAL MARKS
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody>
              {subjects.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      5 +
                      (isMultiExam
                        ? selectedExams.length
                        : componentColumns.length > 0
                          ? componentColumns.length
                          : 1)
                    }
                    className="px-3 py-6 text-center text-xs italic text-gray-500"
                  >
                    No subjects recorded for this exam.
                  </td>
                </tr>
              ) : (
                subjects.map((s, index) => {
                  const passScore = s.passMarks ?? (s.totalMarks === 100 ? 30 : Math.round(s.totalMarks * 0.33))
                  const subjectPass = s.status === 'pass' || s.obtainedMarks >= passScore

                  return (
                    <tr
                      key={s.subjectId}
                      className={cn(
                        'border-b border-sky-100 transition-colors',
                        index % 2 === 1 ? 'bg-sky-50/20' : 'bg-white',
                      )}
                    >
                      {/* Subject Name */}
                      <td className="px-3 py-2 text-left font-black tracking-wide text-[#0a3560] uppercase">
                        {s.subjectName}
                      </td>

                      {/* Full Marks */}
                      <td className="px-2 py-2 text-center font-medium text-slate-700 tabular-nums">
                        {s.totalMarks}
                      </td>

                      {/* Pass Marks */}
                      <td className="px-2 py-2 text-center font-medium text-slate-700 tabular-nums">
                        {passScore}
                      </td>

                      {/* Highest Marks */}
                      <td className="px-2 py-2 text-center font-bold text-emerald-700 tabular-nums">
                        <span className="inline-flex items-center justify-center gap-1">
                          <Trophy className="size-3 text-amber-500" />
                          <span>{s.highestMarks ?? s.obtainedMarks}</span>
                        </span>
                      </td>

                      {/* Exam / Component Marks */}
                      {isMultiExam ? (
                        selectedExams.map((e) => {
                          const sc = s.examScores?.find((es) => es.examId === e.examId)
                          if (!sc || sc.status === 'not_applicable') {
                            return (
                              <td
                                key={e.examId}
                                className="border-l border-sky-100 px-2 py-2 text-center text-gray-400"
                              >
                                —
                              </td>
                            )
                          }
                          if (sc.status === 'absent') {
                            return (
                              <td
                                key={e.examId}
                                className="border-l border-sky-100 px-2 py-2 text-center font-bold text-rose-600"
                              >
                                AB
                              </td>
                            )
                          }
                          return (
                            <td
                              key={e.examId}
                              className="border-l border-sky-100 px-2 py-2 text-center font-semibold text-sky-800 tabular-nums"
                            >
                              {sc.obtainedMarks}
                            </td>
                          )
                        })
                      ) : componentColumns.length > 0 ? (
                        componentColumns.map((c) => {
                          const comp = s.components.find((cc) => cc.name === c)
                          return (
                            <td
                              key={c}
                              className="border-l border-sky-100 px-2 py-2 text-center font-semibold text-sky-800 tabular-nums"
                            >
                              {comp ? comp.obtained : '—'}
                            </td>
                          )
                        })
                      ) : (
                        <td className="border-l border-sky-100 px-2 py-2 text-center font-semibold text-sky-800 tabular-nums">
                          {s.obtainedMarks}
                        </td>
                      )}

                      {/* Total Marks Pill Badge */}
                      <td className="border-l border-sky-100 px-3 py-2 text-center tabular-nums">
                        <span
                          className={cn(
                            'inline-block min-w-9 rounded-full px-2.5 py-0.5 text-center text-[10px] font-black tracking-wide sm:text-[11px]',
                            subjectPass
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800',
                          )}
                        >
                          {s.obtainedMarks}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>

            {/* Table Footer Rows: Grand Total & Overall Percentage */}
            <tfoot>
              {/* Grand Total Row */}
              <tr className="border-t-2 border-sky-200 bg-sky-50/50">
                <td
                  colSpan={
                    4 +
                    (isMultiExam
                      ? selectedExams.length
                      : componentColumns.length > 0
                        ? componentColumns.length
                        : 1)
                  }
                  className="px-3 py-2 text-center text-xs font-black tracking-wider text-[#0a4d8c] uppercase"
                >
                  GRAND TOTAL
                </td>
                <td className="border-l border-sky-200 px-3 py-2 text-center text-xs font-black text-[#0a4d8c] tabular-nums">
                  {totals.obtainedMarks} / {totals.totalMarks}
                </td>
              </tr>

              {/* Overall Percentage Row (Light Purple Banner) */}
              <tr className="border-t border-purple-200 bg-[#f3e8ff]">
                <td
                  colSpan={
                    4 +
                    (isMultiExam
                      ? selectedExams.length
                      : componentColumns.length > 0
                        ? componentColumns.length
                        : 1)
                  }
                  className="px-3 py-2 text-center text-xs font-black tracking-wider text-[#6b21a8] uppercase"
                >
                  OVERALL PERCENTAGE
                </td>
                <td className="border-l border-purple-200 px-3 py-2 text-center text-xs font-black text-[#6b21a8] tabular-nums">
                  {totals.percentage.toFixed(2)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* ============================================================== */}
        {/* 6. DIVISION, GRADE & RESULT STATUS BAR                         */}
        {/* ============================================================== */}
        <section className="relative z-10 my-2.5 flex items-center justify-around rounded-xl border border-pink-200 bg-[#fff0f5] px-4 py-2 text-center text-xs font-extrabold shadow-2xs">
          <div>
            <span className="tracking-wide text-sky-950 uppercase">DIVISION : </span>
            <span className="font-black text-rose-600 uppercase">{displayDivision}</span>
          </div>

          <div className="h-4 w-px bg-pink-300" />

          <div>
            <span className="tracking-wide text-sky-950 uppercase">GRADE : </span>
            <span className="font-black text-rose-600">{totals.grade || '—'}</span>
          </div>

          <div className="h-4 w-px bg-pink-300" />

          <div className="flex items-center gap-1">
            <span className="tracking-wide text-sky-950 uppercase">RESULT : </span>
            {isPass ? (
              <span className="inline-flex items-center gap-1 font-black text-emerald-600">
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                PASS
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-black text-rose-600">
                <XCircle className="size-3.5 text-rose-600" />
                FAIL
              </span>
            )}
          </div>
        </section>

        {/* ============================================================== */}
        {/* 7. REMARKS BANNER (Soft Golden Star Banner)                   */}
        {/* ============================================================== */}
        {options.showRemarks && (
          <section className="relative z-10 my-2.5 flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-[#fefce8] px-4 py-2 text-center text-xs font-black shadow-2xs">
            <Star className="size-4 fill-amber-400 text-amber-500" />
            <span className="tracking-wide text-amber-900 uppercase">
              REMARKS: {displayRemarks}
            </span>
          </section>
        )}

        {/* ============================================================== */}
        {/* 8. SIGNATURES ROW                                              */}
        {/* ============================================================== */}
        <footer className="relative z-10 mb-2 mt-6 pt-2">
          <div className="grid grid-cols-3 gap-6 text-center">
            {/* Signature 1: Parent / Guardian */}
            <div className="flex flex-col items-center justify-end">
              <div className="h-9" />
              <div className="w-4/5 border-t-2 border-slate-700 pt-1 text-[10px] font-bold text-slate-800 sm:text-[11px]">
                {signatures[0] || 'Parent/Guardian Signature'}
              </div>
            </div>

            {/* Signature 2: Class Teacher */}
            <div className="flex flex-col items-center justify-end">
              <div className="h-9" />
              <div className="w-4/5 border-t-2 border-slate-700 pt-1 text-[10px] font-bold text-slate-800 sm:text-[11px]">
                {signatures[1] || 'Class Teacher Signature'}
              </div>
            </div>

            {/* Signature 3: Principal */}
            <div className="flex flex-col items-center justify-end">
              {school.principalSignature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={school.principalSignature}
                  alt="Principal Signature"
                  className="h-9 object-contain"
                />
              ) : (
                <div className="flex h-9 items-center justify-center gap-1 text-[10px] font-semibold text-sky-800">
                  <UserCheck className="size-3.5 text-sky-600" />
                  <span>Principal</span>
                </div>
              )}
              <div className="w-4/5 border-t-2 border-slate-700 pt-1 text-[10px] font-bold text-slate-800 sm:text-[11px]">
                {signatures[2] || 'Principal Signature'}
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* 9. BOTTOM FOOTER PILL & DECORATIVE GRAPHIC                     */}
          {/* ============================================================== */}
          <div className="mt-5 flex flex-col items-center justify-center">
            <div className="w-full max-w-xl rounded-full bg-[#0a447c] px-6 py-1.5 text-center text-[9px] font-medium tracking-wide text-white shadow-2xs sm:text-[10px]">
              {school.name}
              {school.address ? ` | ${school.address}` : ''}
            </div>

            {/* Decorative Open Book Emblem */}
            <div className="mt-2 flex items-center justify-center gap-2 text-teal-600/70">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                <path d="M6 6h10" />
                <path d="M6 10h10" />
              </svg>
            </div>
          </div>
        </footer>

        {/* Bottom Flow Wave SVG Flourish */}
        <div className="pointer-events-none absolute -bottom-4 -left-4 h-24 w-44 opacity-80 print:opacity-100">
          <svg viewBox="0 0 180 100" fill="none" className="size-full">
            <path
              d="M0,100 L0,40 C60,80 120,40 180,100 Z"
              fill="url(#botWaveGrad)"
            />
            <defs>
              <linearGradient id="botWaveGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.25" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Bottom-Right Flow Wave SVG */}
        <div className="pointer-events-none absolute -bottom-4 -right-4 h-20 w-36 opacity-75 print:opacity-100">
          <svg viewBox="0 0 150 80" fill="none" className="size-full">
            <path
              d="M150,80 L150,30 C110,60 60,30 0,80 Z"
              fill="url(#botRightGrad)"
            />
            <defs>
              <linearGradient id="botRightGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0369a1" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.15" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  )
}
