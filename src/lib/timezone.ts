/**
 * Timezone helpers for school-local date resolution.
 *
 * The attendance system is day-based. A "tap" arrives at an absolute instant
 * (UTC) and must be mapped to the calendar date in the school's local
 * timezone — not the server's. A tap at 2026-05-31T19:00:00Z is:
 *   - 2026-06-01 in Asia/Kolkata (IST = UTC+5:30)
 *   - 2026-05-31 in UTC
 * The school cares about the IST date.
 *
 * Uses `Intl.DateTimeFormat` (built into Node.js + browsers) — no extra
 * dependency. School.timezone defaults to "Asia/Kolkata" (schema.prisma:78).
 */

/**
 * Convert a UTC instant to the local-midnight `Date` of the school's
 * timezone, encoded in the SAME shape the existing attendance routes use
 * for the `Attendance.date` column.
 *
 * The existing manual marking route stores the date as
 *   `new Date(year, month - 1, day)`
 * which is server-local midnight (api/school/attendance/route.ts:206).
 * On a server running in the school's timezone, that's the local midnight.
 * We mirror that construction here so kiosk/webhook taps land on the SAME
 * `Date` value and hit the `@@unique([schoolId, studentId, date])` row
 * the manual UI queries against.
 *
 * Assumption: the Node.js server is configured for the school's timezone
 * (the only realistic single-tenant deployment). For multi-tenant servers
 * running in UTC with schools in non-UTC zones, the entire attendance
 * `date` column would need a normalisation pass — out of scope here.
 *
 * Example (server timezone = Asia/Kolkata):
 *   resolveLocalDate('Asia/Kolkata', new Date('2026-05-31T19:00:00Z'))
 *   → Date for 2026-06-01T00:00:00 IST  ( == 2026-05-31T18:30:00Z )
 */
export function resolveLocalDate(timezone: string, instant: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)

  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type)
    if (!part) throw new Error(`Missing ${type} in formatted date`)
    return part.value
  }

  const year = Number.parseInt(get('year'), 10)
  const month = Number.parseInt(get('month'), 10)
  const day = Number.parseInt(get('day'), 10)

  // Server-local Date construction — matches api/school/attendance/route.ts:206.
  return new Date(year, month - 1, day)
}

/**
 * Return the school's local `YYYY-MM-DD` string for a UTC instant. Useful
 * for logging and idempotency keys.
 */
export function localDateString(timezone: string, instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

/**
 * Validate that a timezone identifier is recognized by the runtime. Throws
 * `RangeError` if invalid. Use at admin-edit boundaries, not on hot paths.
 */
export function assertValidTimezone(timezone: string): void {
  // Will throw RangeError on invalid IANA zone.
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
}
