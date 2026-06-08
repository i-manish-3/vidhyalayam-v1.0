/**
 * Shared helpers for hostel allocation billing. Mirrors the inline logic the
 * transport endpoints use (month proration by effective date, fee-month
 * parsing), centralised here so the POST and preview routes stay in sync.
 */

import { db } from '@/lib/db'

// Academic-year month order (Apr → Mar).
export const AY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

export function currentAcademicYear(today: Date): string {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth() + 1
  return m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

export function parseDate(s: unknown): Date | null {
  if (typeof s !== 'string' || !s.trim()) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function parseFeeMonths(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((m): m is string => typeof m === 'string' && !!m.trim())
      : []
  } catch {
    return value.split(',').map((m) => m.trim()).filter(Boolean)
  }
}

// Drop months that fall strictly before effectiveFrom (pro-rate a mid-year join).
export function proRateMonths(allMonths: string[], academicYear: string, effectiveFrom: Date): string[] {
  const [startYearStr] = academicYear.split('-')
  const startYear = Number(startYearStr)
  const effYM = effectiveFrom.getUTCFullYear() * 12 + effectiveFrom.getUTCMonth()
  const monthLabelToYM = (label: string): number | null => {
    if (!Number.isFinite(startYear)) return null
    const idx = AY_MONTHS.findIndex((m) => m.toLowerCase() === label.toLowerCase())
    if (idx === -1) return null
    const calMonth = idx <= 8 ? idx + 3 : idx - 9
    const calYear = idx <= 8 ? startYear : startYear + 1
    return calYear * 12 + calMonth
  }
  return allMonths.filter((label) => {
    const ym = monthLabelToYM(label)
    return ym === null || ym >= effYM
  })
}

// Resolve a room's fare + fee months for an academic year from HostelRoomFare.
export async function resolveRoomFare(
  schoolId: string,
  roomId: string,
  academicYear: string,
): Promise<{ fare: number; feeMonths: string } | null> {
  const roomFare = await db.hostelRoomFare.findFirst({
    where: { schoolId, roomId, academicYear, isActive: true },
    select: { fare: true, feeMonths: true },
  })
  return roomFare ?? null
}
