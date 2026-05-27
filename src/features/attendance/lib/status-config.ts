import { Check, X, CalendarOff, Clock, Hourglass } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type AttendanceStatus = 'present' | 'absent' | 'leave' | 'late' | 'half_day'

export interface StatusConfig {
  label: string
  shortLabel: string
  icon: LucideIcon
  bgColor: string
  textColor: string
  dotColor: string
  avatarBg: string
  barColor: string
}

// Status colors and icons used across the attendance feature (mark, view,
// reports, calendar). Centralised so cosmetic tweaks happen in one place.
export const STATUS_CONFIG: Record<AttendanceStatus, StatusConfig> = {
  present: {
    label: 'Present',
    shortLabel: 'P',
    icon: Check,
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/50',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    dotColor: 'bg-emerald-500',
    avatarBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    barColor: 'bg-emerald-500',
  },
  absent: {
    label: 'Absent',
    shortLabel: 'A',
    icon: X,
    bgColor: 'bg-red-50 dark:bg-red-950/50',
    textColor: 'text-red-700 dark:text-red-300',
    dotColor: 'bg-red-500',
    avatarBg: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    barColor: 'bg-red-500',
  },
  leave: {
    label: 'Leave',
    shortLabel: 'L',
    icon: CalendarOff,
    bgColor: 'bg-amber-50 dark:bg-amber-950/50',
    textColor: 'text-amber-700 dark:text-amber-300',
    dotColor: 'bg-amber-500',
    avatarBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    barColor: 'bg-amber-500',
  },
  late: {
    label: 'Late',
    shortLabel: 'Lt',
    icon: Clock,
    bgColor: 'bg-sky-50 dark:bg-sky-950/50',
    textColor: 'text-sky-700 dark:text-sky-300',
    dotColor: 'bg-sky-500',
    avatarBg: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
    barColor: 'bg-sky-500',
  },
  half_day: {
    label: 'Half Day',
    shortLabel: 'H',
    icon: Hourglass,
    bgColor: 'bg-violet-50 dark:bg-violet-950/50',
    textColor: 'text-violet-700 dark:text-violet-300',
    dotColor: 'bg-violet-500',
    avatarBg: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
    barColor: 'bg-violet-500',
  },
}

export const ALL_STATUSES: AttendanceStatus[] = ['present', 'absent', 'leave', 'late', 'half_day']
