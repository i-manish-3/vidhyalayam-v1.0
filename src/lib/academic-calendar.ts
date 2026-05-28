import { db } from '@/lib/db'
import {
  ALL_WEEKDAYS,
  DEFAULT_WORKING_DAYS,
  parseWorkingDays,
  weekdayName,
  type Weekday,
} from '@/lib/weekdays'

export { ALL_WEEKDAYS, DEFAULT_WORKING_DAYS, parseWorkingDays, weekdayName }
export type { Weekday }

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export async function getSchoolWorkingDays(schoolId: string): Promise<Weekday[]> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { workingDays: true },
  })
  return parseWorkingDays(school?.workingDays)
}

export type HolidayRecord = {
  id: string
  date: Date
  endDate: Date | null
  name: string
  type: string
}

export async function getHolidaysInRange(
  schoolId: string,
  academicYear: string,
  from: Date,
  to: Date
): Promise<HolidayRecord[]> {
  const fromDay = startOfDay(from)
  const toDay = startOfDay(to)

  // Holiday is in range if its [date, endDate ?? date] window overlaps [from, to]
  const holidays = await db.holiday.findMany({
    where: {
      schoolId,
      academicYear,
      deletedAt: null,
      OR: [
        { date: { lte: toDay }, endDate: null },
        { date: { lte: toDay }, endDate: { gte: fromDay } },
      ],
    },
    select: { id: true, date: true, endDate: true, name: true, type: true },
    orderBy: { date: 'asc' },
  })

  return holidays.filter((h) => {
    const start = startOfDay(h.date)
    const end = startOfDay(h.endDate ?? h.date)
    return end >= fromDay && start <= toDay
  })
}

export function isDateOnHoliday(date: Date, holidays: HolidayRecord[]): HolidayRecord | null {
  const day = startOfDay(date)
  for (const h of holidays) {
    const start = startOfDay(h.date)
    const end = startOfDay(h.endDate ?? h.date)
    if (day >= start && day <= end) return h
  }
  return null
}

export function isTeachingDay(
  date: Date,
  workingDays: Weekday[],
  holidays: HolidayRecord[]
): boolean {
  if (!workingDays.includes(weekdayName(date))) return false
  if (isDateOnHoliday(date, holidays)) return false
  return true
}

export async function getTeachingDays(
  schoolId: string,
  academicYear: string,
  from: Date,
  to: Date
): Promise<Date[]> {
  if (startOfDay(from) > startOfDay(to)) return []
  const [workingDays, holidays] = await Promise.all([
    getSchoolWorkingDays(schoolId),
    getHolidaysInRange(schoolId, academicYear, from, to),
  ])

  const result: Date[] = []
  const cursor = startOfDay(from)
  const last = startOfDay(to)
  while (cursor <= last) {
    if (isTeachingDay(cursor, workingDays, holidays)) {
      result.push(new Date(cursor))
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}

// Returns the academic year's start date (from AcademicYear.startDate). Falls
// back to April 1 of the first year segment when startDate is missing — Indian
// schools default to an April-March academic year.
export async function getAcademicYearStart(
  schoolId: string,
  academicYear: string
): Promise<Date | null> {
  const ay = await db.academicYear.findFirst({
    where: { schoolId, name: academicYear, deletedAt: null },
    select: { startDate: true },
  })
  if (ay?.startDate) return startOfDay(ay.startDate)
  const match = /^(\d{4})-\d{4}$/.exec(academicYear)
  if (!match) return null
  return new Date(Number(match[1]), 3, 1) // April 1
}

export async function isSchoolTeachingDay(
  schoolId: string,
  academicYear: string,
  date: Date
): Promise<{ teaching: true } | { teaching: false; reason: 'non-working-day' | 'holiday'; holiday?: HolidayRecord }> {
  const [workingDays, holidays] = await Promise.all([
    getSchoolWorkingDays(schoolId),
    getHolidaysInRange(schoolId, academicYear, date, date),
  ])
  if (!workingDays.includes(weekdayName(date))) {
    return { teaching: false, reason: 'non-working-day' }
  }
  const onHoliday = isDateOnHoliday(date, holidays)
  if (onHoliday) {
    return { teaching: false, reason: 'holiday', holiday: onHoliday }
  }
  return { teaching: true }
}

export { startOfDay, isSameDay }
