/**
 * Pure, dependency-free platform-announcement helpers shared by client + server.
 * MUST NOT import the Prisma client or next/server — this module is bundled into
 * client components (the banner + admin page). DB-backed logic lives in
 * ./platform-announcements.
 */

export type AnnouncementSeverity = 'info' | 'warning' | 'critical'
export type AnnouncementStatus = 'draft' | 'active' | 'archived'
export type AnnouncementAudience = 'all' | 'school_admins' | 'teachers' | 'students' | 'parents'

export const SEVERITIES: readonly AnnouncementSeverity[] = ['info', 'warning', 'critical']
export const STATUSES: readonly AnnouncementStatus[] = ['draft', 'active', 'archived']
export const AUDIENCES: readonly AnnouncementAudience[] = [
  'all',
  'school_admins',
  'teachers',
  'students',
  'parents',
]

// Audience bucket -> the user role it targets.
const AUDIENCE_ROLE: Record<Exclude<AnnouncementAudience, 'all'>, string> = {
  school_admins: 'SCHOOL_ADMIN',
  teachers: 'TEACHER',
  students: 'STUDENT',
  parents: 'PARENT',
}

// Server-side field caps (the UI also enforces some of these, but never trust it).
export const MAX_TITLE = 120
export const MAX_MESSAGE = 2000
export const MAX_LINK_URL = 2048
export const MAX_LINK_LABEL = 80

/** Minimal shape needed to decide visibility (works for Prisma rows + tests). */
export interface AnnouncementVisibilityFields {
  id: string
  status: string
  audience: string
  dismissible: boolean
  startsAt: Date | null
  expiresAt: Date | null
}

/** Shape returned to clients for rendering a banner. */
export interface ActiveBanner {
  id: string
  title: string
  message: string
  severity: AnnouncementSeverity
  dismissible: boolean
  linkUrl: string | null
  linkLabel: string | null
  createdAt: string
}

/** Full row shape for the super-admin management views. */
export interface PlatformAnnouncementRow {
  id: string
  title: string
  message: string
  severity: string
  status: string
  audience: string
  dismissible: boolean
  linkUrl: string | null
  linkLabel: string | null
  startsAt: Date | null
  expiresAt: Date | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Does this announcement's audience include the given role?
 * SUPER_ADMIN sees every audience (so the platform owner can preview).
 */
export function audienceMatchesRole(audience: string, role: string): boolean {
  if (role === 'SUPER_ADMIN') return true
  if (audience === 'all') return true
  return AUDIENCE_ROLE[audience as Exclude<AnnouncementAudience, 'all'>] === role
}

/**
 * Pure predicate: is this announcement currently visible to `role` at `now`,
 * given the set of announcement ids the user has dismissed?
 */
export function isVisibleForUser(
  a: AnnouncementVisibilityFields,
  role: string,
  dismissedIds: ReadonlySet<string>,
  now: Date,
): boolean {
  if (a.status !== 'active') return false
  if (a.startsAt && a.startsAt.getTime() > now.getTime()) return false
  if (a.expiresAt && a.expiresAt.getTime() <= now.getTime()) return false
  if (!audienceMatchesRole(a.audience, role)) return false
  if (a.dismissible && dismissedIds.has(a.id)) return false
  return true
}

/** Pure filter over a list of announcements (trivially unit-testable). */
export function resolveActiveForUser<T extends AnnouncementVisibilityFields>(
  announcements: readonly T[],
  role: string,
  dismissedIds: ReadonlySet<string>,
  now: Date,
): T[] {
  return announcements.filter((a) => isVisibleForUser(a, role, dismissedIds, now))
}

/** Serialize a row (optionally with a dismissal count) for the admin API. */
export function serializeAnnouncement(
  a: PlatformAnnouncementRow & { _count?: { dismissals: number } },
): Record<string, unknown> {
  return {
    id: a.id,
    title: a.title,
    message: a.message,
    severity: a.severity,
    status: a.status,
    audience: a.audience,
    dismissible: a.dismissible,
    linkUrl: a.linkUrl,
    linkLabel: a.linkLabel,
    startsAt: a.startsAt,
    expiresAt: a.expiresAt,
    createdBy: a.createdBy,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    dismissCount: a._count?.dismissals ?? 0,
  }
}

/**
 * Parse an optional ISO-8601 date string into a Date or null.
 * Returns `false` for invalid input. Requires a real ISO date prefix
 * (YYYY-MM-DDTHH:MM…) so loose strings like "next monday" are rejected; the
 * client always sends `Date.toISOString()`.
 */
export function parseOptionalDate(value: unknown): Date | null | false {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return false
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? false : d
}

/**
 * Validate a user-supplied link URL. Returns the trimmed URL, `null` when empty,
 * or `false` when invalid (bad/over-long, or a non-http(s) scheme such as
 * `javascript:` — which would be a stored-XSS vector in the banner's <a href>).
 */
export function sanitizeLinkUrl(value: unknown): string | null | false {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return false
  const raw = value.trim()
  if (!raw) return null
  if (raw.length > MAX_LINK_URL) return false
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    return raw
  } catch {
    return false
  }
}
