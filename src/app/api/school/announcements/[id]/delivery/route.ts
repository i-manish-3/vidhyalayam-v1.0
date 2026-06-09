import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/announcements/[id]/delivery - delivery status + analytics
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'announcement:view_analytics')
    if (!user || !user.schoolId) return unauthorizedError()
    const { id } = await params

    const announcement = await db.announcement.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!announcement) return apiError(404, 'Announcement not found.')

    // Per-channel delivery breakdown across the notifications spawned by this announcement.
    const notifications = await db.notification.findMany({
      where: { announcementId: id, schoolId: user.schoolId },
      select: { id: true, isRead: true },
    })
    const notificationIds = notifications.map((n) => n.id)
    const readCount = notifications.filter((n) => n.isRead).length

    const deliveryRows = notificationIds.length
      ? await db.notificationDelivery.groupBy({
          by: ['channel', 'status'],
          where: { notificationId: { in: notificationIds } },
          _count: { _all: true },
        })
      : []

    const channelBreakdown = deliveryRows.map((row) => ({
      channel: row.channel,
      status: row.status,
      count: row._count._all,
    }))

    return NextResponse.json({
      announcement: {
        id: announcement.id,
        title: announcement.title,
        status: announcement.status,
        recipientCount: announcement.recipientCount,
        deliveredCount: announcement.deliveredCount,
        failedCount: announcement.failedCount,
        sentAt: announcement.sentAt,
        scheduledAt: announcement.scheduledAt,
      },
      inApp: { total: notifications.length, readCount, unreadCount: notifications.length - readCount },
      channelBreakdown,
    })
  } catch (error) {
    console.error('Announcement delivery error:', error)
    return internalError('loading announcement delivery status')
  }
}
