/**
 * Timezone-aware date helpers for fee reports. School day/month boundaries must
 * be computed in the school's local timezone, otherwise a late-evening IST
 * payment lands in the wrong day/month bucket (off-by-one vs UTC).
 */

export function getZonedParts(instant: Date, timezone: string, includeTime = false) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }
      : {}),
  }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value || 0)
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: includeTime ? value('hour') : 0,
    minute: includeTime ? value('minute') : 0,
    second: includeTime ? value('second') : 0,
  }
}

function getTimezoneOffsetMs(instant: Date, timezone: string): number {
  const parts = getZonedParts(instant, timezone, true)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - instant.getTime()
}

export function zonedLocalTimeToUtc(year: number, month: number, day: number, timezone: string): Date {
  let utc = Date.UTC(year, month - 1, day, 0, 0, 0, 0)
  for (let i = 0; i < 2; i += 1) {
    utc = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - getTimezoneOffsetMs(new Date(utc), timezone)
  }
  return new Date(utc)
}

export function startOfZonedDay(instant: Date, timezone: string): Date {
  const p = getZonedParts(instant, timezone)
  return zonedLocalTimeToUtc(p.year, p.month, p.day, timezone)
}

export function startOfZonedMonth(instant: Date, timezone: string): Date {
  const p = getZonedParts(instant, timezone)
  return zonedLocalTimeToUtc(p.year, p.month, 1, timezone)
}

export function addZonedDays(instant: Date, days: number, timezone: string): Date {
  const p = getZonedParts(instant, timezone)
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return zonedLocalTimeToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), timezone)
}

export function addZonedMonths(instant: Date, months: number, timezone: string): Date {
  const p = getZonedParts(instant, timezone)
  const shifted = new Date(Date.UTC(p.year, p.month - 1 + months, p.day))
  return zonedLocalTimeToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), timezone)
}

export function toDateKey(d: Date, timezone: string): string {
  const p = getZonedParts(d, timezone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function toMonthKey(d: Date, timezone: string): string {
  const p = getZonedParts(d, timezone)
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

/** Indian academic year (e.g. "2025-2026") starts April 1 of the first year. */
export function academicYearStart(ay: string | undefined, timezone: string): Date | null {
  if (!ay) return null
  const match = ay.match(/^(\d{4})-(\d{4})$/)
  if (!match) return null
  return zonedLocalTimeToUtc(parseInt(match[1], 10), 4, 1, timezone)
}

export function academicYearStartFor(instant: Date, timezone: string): Date {
  const p = getZonedParts(instant, timezone)
  const year = p.month < 4 ? p.year - 1 : p.year
  return zonedLocalTimeToUtc(year, 4, 1, timezone)
}
