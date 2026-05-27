import { db } from '@/lib/db'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const ATTENDANCE_STATUSES = ['present', 'absent', 'leave', 'late', 'half_day'] as const
export type AttendanceStatusKey = (typeof ATTENDANCE_STATUSES)[number]

export interface StatusTotals {
  present: number
  absent: number
  leave: number
  late: number
  half_day: number
  total: number
  percent: number
}

export interface EnrolledStudent {
  id: string
  firstName: string
  lastName: string
  rollNumber: string | null
  className: string | null
  sectionName: string | null
}

export async function resolveAcademicYear(schoolId: string, value: string | null): Promise<string | null> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const academicYear = (value || school?.academicYear || '').trim()
  if (!ACADEMIC_YEAR_PATTERN.test(academicYear)) return null
  return academicYear
}

export function parseLocalMidnight(value: string | null | undefined): Date | null {
  if (!value || !DATE_PATTERN.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (Number.isNaN(dt.getTime())) return null
  return dt
}

export function formatIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

// % is strict: only `present` counts toward "present". late/half_day/leave
// count toward the marked total but not toward the present numerator.
export function computePercent(present: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((present / total) * 1000) / 10
}

export function emptyTotals(): StatusTotals {
  return { present: 0, absent: 0, leave: 0, late: 0, half_day: 0, total: 0, percent: 0 }
}

export function addStatus(totals: StatusTotals, status: string, count: number): void {
  if (status === 'present') totals.present += count
  else if (status === 'absent') totals.absent += count
  else if (status === 'leave') totals.leave += count
  else if (status === 'late') totals.late += count
  else if (status === 'half_day') totals.half_day += count
  totals.total += count
}

// Resolves students enrolled in (classId[, sectionId]) for an academic year.
// Mirrors the OR: [academicEnrollments, admission] resolution used by the
// attendance GET route, then projects per-year roll number / class / section.
export async function getEnrolledStudents(
  schoolId: string,
  academicYear: string,
  classId: string,
  sectionId: string | null,
): Promise<EnrolledStudent[]> {
  const students = await db.student.findMany({
    where: {
      schoolId,
      deletedAt: null,
      OR: [
        {
          academicEnrollments: {
            some: {
              academicYear,
              classId,
              ...(sectionId ? { sectionId } : {}),
              deletedAt: null,
            },
          },
        },
        {
          admission: {
            academicYear,
            classId,
            ...(sectionId ? { sectionId } : {}),
          },
        },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      rollNumber: true,
      class: { select: { name: true } },
      section: { select: { name: true } },
      academicEnrollments: {
        where: { academicYear, deletedAt: null },
        select: {
          rollNumber: true,
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
        take: 1,
      },
    },
  })

  return students.map((s) => {
    const enr = s.academicEnrollments[0]
    return {
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      rollNumber: enr?.rollNumber ?? s.rollNumber,
      className: enr?.class?.name ?? s.class?.name ?? null,
      sectionName: enr?.section?.name ?? s.section?.name ?? null,
    }
  })
}

const rollCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export function compareByRoll(a: { rollNumber: string | null; firstName: string; lastName: string }, b: { rollNumber: string | null; firstName: string; lastName: string }): number {
  const aRoll = (a.rollNumber || '').trim()
  const bRoll = (b.rollNumber || '').trim()
  if (aRoll && !bRoll) return -1
  if (!aRoll && bRoll) return 1
  const r = rollCollator.compare(aRoll, bRoll)
  if (r !== 0) return r
  return rollCollator.compare(`${a.firstName} ${a.lastName}`, `${b.firstName} ${b.lastName}`)
}

// Computes per-student StatusTotals for a class/section over a date range.
// Used by both the Monthly Summary and Defaulters reports.
export async function computeStudentSummaries(
  schoolId: string,
  academicYear: string,
  classId: string,
  sectionId: string | null,
  dateFrom: Date,
  dateTo: Date,
): Promise<Array<EnrolledStudent & { totals: StatusTotals }>> {
  const students = await getEnrolledStudents(schoolId, academicYear, classId, sectionId)
  const studentIds = students.map((s) => s.id)
  if (studentIds.length === 0) return []

  const grouped = await db.attendance.groupBy({
    by: ['studentId', 'status'],
    where: {
      schoolId,
      academicYear,
      studentId: { in: studentIds },
      date: { gte: dateFrom, lte: dateTo },
    },
    _count: { _all: true },
  })

  const byStudent = new Map<string, StatusTotals>()
  for (const s of students) byStudent.set(s.id, emptyTotals())
  for (const g of grouped) {
    const totals = byStudent.get(g.studentId)
    if (totals) addStatus(totals, g.status, g._count._all)
  }
  for (const totals of byStudent.values()) {
    totals.percent = computePercent(totals.present, totals.total)
  }

  return students
    .map((s) => ({ ...s, totals: byStudent.get(s.id) ?? emptyTotals() }))
    .sort(compareByRoll)
}
