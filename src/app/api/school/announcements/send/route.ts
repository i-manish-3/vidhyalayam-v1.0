import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { notificationService, type NotificationChannel, type NotificationTarget } from '@/lib/notifications'

// Map the legacy `audience` string onto the structured target spec.
function audienceToTarget(audience?: string): NotificationTarget {
  switch (audience) {
    case 'teachers':
      return { roles: ['TEACHER'] }
    case 'students':
      return { roles: ['STUDENT'] }
    case 'parents':
      return { roles: ['PARENT'] }
    case 'staff':
      return { roles: ['STAFF'] }
    case 'all':
    default:
      return { all: true }
  }
}

/**
 * POST /api/school/announcements/send
 * Creates an announcement, persists its targets, and either fans it out now or
 * marks it scheduled. The actual mass fan-out reuses notificationService.sendBulk
 * so each recipient gets a real per-user notification (in-app + selected channels).
 *
 * Body: { title, content, richContent?, audience?, target?, priority?, channels?,
 *         scheduledAt?, expiresAt? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'announcement:publish')
    if (!user || !user.schoolId) return unauthorizedError()
    const schoolId = user.schoolId

    const body = await request.json()
    const {
      title,
      content,
      richContent,
      audience,
      target,
      priority,
      channels,
      scheduledAt,
      expiresAt,
    } = body

    if (!title || !content) {
      return apiError(400, 'Please enter both a title and the announcement content.')
    }

    const resolvedTarget: NotificationTarget = target ?? audienceToTarget(audience)
    const selectedChannels = (channels as NotificationChannel[]) ?? ['IN_APP']
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null
    const isScheduled = Boolean(scheduledDate && scheduledDate.getTime() > Date.now())

    // Create the announcement record + its target rows in one transaction.
    const announcement = await db.$transaction(async (tx) => {
      const created = await tx.announcement.create({
        data: {
          schoolId,
          title,
          content,
          richContent: richContent ?? null,
          audience: audience || 'all',
          priority: priority || 'normal',
          channels: selectedChannels,
          status: isScheduled ? 'scheduled' : 'processing',
          scheduledAt: scheduledDate,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          createdBy: user.userId,
        },
      })
      await tx.announcementTarget.create({
        data: {
          announcementId: created.id,
          schoolId,
          targetType: target ? 'CUSTOM' : (audience || 'all').toUpperCase(),
          targetValue: resolvedTarget as unknown as Prisma.InputJsonValue,
        },
      })
      return created
    })

    // Scheduled announcements are picked up later by the (deferred) scheduler.
    if (isScheduled) {
      return NextResponse.json(
        { announcement, status: 'scheduled', scheduledAt: scheduledDate },
        { status: 201 },
      )
    }

    // Immediate fan-out.
    const result = await notificationService.sendBulk({
      schoolId,
      target: resolvedTarget,
      title,
      message: content,
      type: 'announcement',
      priority: priority || 'normal',
      module: 'announcement',
      channels: selectedChannels,
      createdBy: user.userId,
      announcementId: announcement.id,
    })

    const updated = await db.announcement.update({
      where: { id: announcement.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        recipientCount: result.recipientCount,
        deliveredCount: result.createdCount,
      },
    })

    return NextResponse.json(
      { announcement: updated, recipientCount: result.recipientCount, createdCount: result.createdCount },
      { status: 201 },
    )
  } catch (error) {
    console.error('Send announcement error:', error)
    return internalError('sending the announcement')
  }
}
