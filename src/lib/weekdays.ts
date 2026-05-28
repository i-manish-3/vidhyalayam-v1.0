// Pure (no DB) helpers for weekday handling. Safe to import from client.

export const ALL_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export type Weekday = (typeof ALL_WEEKDAYS)[number]

export const DEFAULT_WORKING_DAYS: Weekday[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export function parseWorkingDays(raw: string | null | undefined): Weekday[] {
  if (!raw) return DEFAULT_WORKING_DAYS
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_WORKING_DAYS
    const valid = parsed.filter((d): d is Weekday => (ALL_WEEKDAYS as readonly string[]).includes(d))
    return valid.length > 0 ? valid : DEFAULT_WORKING_DAYS
  } catch {
    return DEFAULT_WORKING_DAYS
  }
}

export function weekdayName(d: Date): Weekday {
  return ALL_WEEKDAYS[d.getDay()]
}
