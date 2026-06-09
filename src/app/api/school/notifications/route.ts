import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { notificationService, type NotificationChannel } from '@/lib/notifications'

// Build the additive advanced filters shared by both visibility branches.
function buildExtraFilters(searchParams: URLSearchParams): Record<string, unknown> {
  const filters: Record<string, unknown> = {}
  const type = searchParams.get('type')
  const priority = searchParams.get('priority')
  const moduleName = searchParams.get('module')
  const search = searchParams.get('search')
  const isReadFilter = searchParams.get('isRead') || ''
  if (type) filters.type = type
  if (priority) filters.priority = priority
  if (moduleName) filters.module = moduleName
  if (isReadFilter !== '') filters.isRead = isReadFilter === 'true'
  // Hide archived unless explicitly requested.
  if (searchParams.get('includeArchived') !== 'true') filters.archivedAt = null
  if (search) {
    filters.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { message: { contains: search, mode: 'insensitive' } },
    ]
  }
  return filters
}

// GET /api/school/notifications - List notifications
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF', 'STUDENT', 'PARENT'])
    if (!user) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    // Advanced filters (type, priority, module, search, isRead, includeArchived).
    // `search` arrives as an OR; merge it under AND so it doesn't clobber the
    // scoping OR below.
    const extra = buildExtraFilters(searchParams)
    const { OR: searchOr, ...scalarExtra } = extra as { OR?: unknown[] } & Record<string, unknown>
    const extraWhere = {
      ...scalarExtra,
      ...(searchOr ? { AND: [{ OR: searchOr }] } : {}),
    }

    let notifications
    let total
    let unreadCount

    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN sees system-wide notifications (schoolId = null) or personal ones
      const baseFilter = {
        OR: [
          { schoolId: { equals: null } },
          { userId: user.userId },
        ],
      }

      const where: Record<string, unknown> = { ...baseFilter, ...extraWhere }

      ;[notifications, total] = await Promise.all([
        db.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: { school: { select: { name: true } } },
        }),
        db.notification.count({ where }),
      ])

      unreadCount = await db.notification.count({
        where: {
          isRead: false,
          OR: [
            { schoolId: { equals: null } },
            { userId: user.userId },
          ],
        },
      })
    } else {
      if (!user.schoolId) {
        return unauthorizedError()
      }

      const baseFilter = {
        schoolId: user.schoolId,
        OR: [
          { userId: null },
          { userId: user.userId },
        ],
      }

      const where: Record<string, unknown> = { ...baseFilter, ...extraWhere }

      ;[notifications, total] = await Promise.all([
        db.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        db.notification.count({ where }),
      ])

      unreadCount = await db.notification.count({
        where: {
          schoolId: user.schoolId,
          isRead: false,
          OR: [
            { userId: null },
            { userId: user.userId },
          ],
        },
      })
    }

    return NextResponse.json({
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List notifications error:', error)
    return internalError('listing notifications')
  }
}

// POST /api/school/notifications - Create notification
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'notification:create')
    if (!user) {
      return apiError(403, "You don't have permission to create notifications.")
    }

    const body = await request.json()
    const { title, message, type, userId, schoolId, priority, module: moduleName, entityId, channels, actionUrl, recipientRole, metadata, mandatory } = body

    if (!title || !message) {
      return apiError(400, 'Please enter both a title and the notification message.')
    }

    // SUPER_ADMIN can create system-wide (schoolId: null) or school-specific notifications
    // SCHOOL_ADMIN can only create for their own school
    const notificationSchoolId = user.role === 'SUPER_ADMIN'
      ? (schoolId || null)
      : user.schoolId ?? null

    let notificationId: string | null
    if (userId) {
      // Targeted: per-user notification, published in real-time + external channels.
      notificationId = await notificationService.createNotification({
        schoolId: notificationSchoolId,
        userId,
        title,
        message,
        type: type || 'info',
        priority,
        module: moduleName ?? null,
        entityId: entityId ?? null,
        recipientRole: recipientRole ?? null,
        actionUrl: actionUrl ?? null,
        channels: (channels as NotificationChannel[]) ?? undefined,
        metadata: metadata ?? null,
        mandatory: Boolean(mandatory),
        createdBy: user.userId,
      })
    } else {
      // Broadcast to everyone in the school (preserves legacy userId=null behavior).
      notificationId = await notificationService.broadcastToSchool({
        schoolId: notificationSchoolId,
        title,
        message,
        type: type || 'info',
        createdBy: user.userId,
      })
    }

    if (!notificationId) return internalError('creating the notification')
    const notification = await db.notification.findUnique({ where: { id: notificationId } })
    return NextResponse.json(notification, { status: 201 })
  } catch (error) {
    console.error('Create notification error:', error)
    return internalError('creating the notification')
  }
}

// PATCH /api/school/notifications - Mark all as read / Mark single as read
export async function PATCH(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF', 'STUDENT', 'PARENT'])
    if (!user) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { markAllRead, notificationId, archive } = body
    const now = new Date()

    if (markAllRead) {
      if (user.role === 'SUPER_ADMIN') {
        await db.notification.updateMany({
          where: {
            isRead: false,
            OR: [
              { schoolId: { equals: null } },
              { userId: user.userId },
            ],
          },
          data: { isRead: true, readAt: now },
        })
      } else {
        if (!user.schoolId) {
          return unauthorizedError()
        }
        await db.notification.updateMany({
          where: {
            schoolId: user.schoolId,
            isRead: false,
            OR: [
              { userId: null },
              { userId: user.userId },
            ],
          },
          data: { isRead: true, readAt: now },
        })
      }
      return NextResponse.json({ success: true, message: 'All notifications marked as read' })
    }

    if (notificationId) {
      // Ownership guard: a user may only mutate their own (or school-broadcast) rows.
      const target = await db.notification.findUnique({
        where: { id: notificationId },
        select: { userId: true, schoolId: true },
      })
      if (!target) return apiError(404, 'Notification not found.')
      const ownsIt =
        target.userId === user.userId ||
        (target.userId === null &&
          (user.role === 'SUPER_ADMIN' ? target.schoolId === null : target.schoolId === user.schoolId))
      if (!ownsIt) return apiError(403, 'You can only update your own notifications.')

      await db.notification.update({
        where: { id: notificationId },
        data: archive ? { archivedAt: now } : { isRead: true, readAt: now },
      })
      return NextResponse.json({ success: true, message: archive ? 'Notification archived' : 'Notification marked as read' })
    }

    return apiError(400, 'Please select a notification to mark as read, or choose "Mark all as read".')
  } catch (error) {
    console.error('Update notification error:', error)
    return internalError('updating notification')
  }
}
