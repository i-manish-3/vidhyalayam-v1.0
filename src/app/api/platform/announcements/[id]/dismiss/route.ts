import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'
import { audienceMatchesRole } from '@/lib/platform-announcements'

// POST /api/platform/announcements/[id]/dismiss — current user dismisses a
// banner. Idempotent: the unique (announcementId, userId) constraint means a
// repeat dismiss is a no-op rather than an error. Guards ensure a user can only
// dismiss a banner that is actually live and targeted at their role (so callers
// can't pre-dismiss future/other-audience banners by enumerating ids).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUser(request)
    if (!user) return unauthorizedError()

    const { id } = await params
    const announcement = await db.platformAnnouncement.findUnique({
      where: { id },
      select: { id: true, dismissible: true, status: true, audience: true },
    })
    if (!announcement) return notFoundError('Announcement')
    if (announcement.status !== 'active') {
      return apiError(409, 'This announcement is not currently active.')
    }
    if (!audienceMatchesRole(announcement.audience, user.role)) {
      return apiError(403, 'This announcement is not visible to your role.')
    }
    if (!announcement.dismissible) {
      return apiError(409, 'This announcement cannot be dismissed.')
    }

    await db.platformAnnouncementDismissal.upsert({
      where: { announcementId_userId: { announcementId: id, userId: user.userId } },
      create: { announcementId: id, userId: user.userId },
      update: {},
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Dismiss platform announcement error:', error)
    return internalError('dismissing the announcement')
  }
}
