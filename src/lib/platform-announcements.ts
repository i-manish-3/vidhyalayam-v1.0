import { db } from '@/lib/db'
import { resolveActiveForUser, type AnnouncementSeverity, type ActiveBanner } from '@/lib/platform-announcements-shared'

/**
 * Platform broadcast announcements — DB-backed fetch for the per-user "active
 * banners" feed. Pure helpers + constants live in ./platform-announcements-shared
 * (client-safe). This module is server-only (imports the Prisma client).
 */

// Re-export the client-safe surface so server callers can import from one place.
export * from '@/lib/platform-announcements-shared'

/**
 * Return the banners currently visible to a user. Narrowed at the query level
 * (status + time window) for index efficiency, then audience + dismissal are
 * applied in memory.
 */
export async function getActiveBannersForUser(userId: string, role: string): Promise<ActiveBanner[]> {
  // The platform owner authors these broadcasts; never show them their own
  // maintenance/feature banners inside the super-admin panel.
  if (role === 'SUPER_ADMIN') return []

  const now = new Date()

  const announcements = await db.platformAnnouncement.findMany({
    where: {
      status: 'active',
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
  })

  if (announcements.length === 0) return []

  const dismissals = await db.platformAnnouncementDismissal.findMany({
    where: { userId, announcementId: { in: announcements.map((a) => a.id) } },
    select: { announcementId: true },
  })
  const dismissedIds = new Set(dismissals.map((d) => d.announcementId))

  return resolveActiveForUser(announcements, role, dismissedIds, now).map((a) => ({
    id: a.id,
    title: a.title,
    message: a.message,
    severity: a.severity as AnnouncementSeverity,
    dismissible: a.dismissible,
    linkUrl: a.linkUrl,
    linkLabel: a.linkLabel,
    createdAt: a.createdAt.toISOString(),
  }))
}
