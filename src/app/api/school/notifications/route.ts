import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/notifications - List notifications
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF', 'STUDENT', 'PARENT'])
    if (!user) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || ''
    const isReadFilter = searchParams.get('isRead') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

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

      const typeFilter = type ? { type } : {}
      const readFilter = isReadFilter !== '' ? { isRead: isReadFilter === 'true' } : {}

      const where = { ...baseFilter, ...typeFilter, ...readFilter }

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

      const typeFilter = type ? { type } : {}
      const readFilter = isReadFilter !== '' ? { isRead: isReadFilter === 'true' } : {}

      const where = { ...baseFilter, ...typeFilter, ...readFilter }

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
    const { title, message, type, userId, schoolId } = body

    if (!title || !message) {
      return apiError(400, 'Please enter both a title and the notification message.')
    }

    // SUPER_ADMIN can create system-wide (schoolId: null) or school-specific notifications
    // SCHOOL_ADMIN can only create for their own school
    const notificationSchoolId = user.role === 'SUPER_ADMIN'
      ? (schoolId || null)
      : user.schoolId

    const notification = await db.notification.create({
      data: {
        schoolId: notificationSchoolId,
        userId: userId || null,
        title,
        message,
        type: type || 'info',
      },
    })

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
    const { markAllRead, notificationId } = body

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
          data: { isRead: true },
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
          data: { isRead: true },
        })
      }
      return NextResponse.json({ success: true, message: 'All notifications marked as read' })
    }

    if (notificationId) {
      // Mark a single notification as read
      await db.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
      })
      return NextResponse.json({ success: true, message: 'Notification marked as read' })
    }

    return apiError(400, 'Please select a notification to mark as read, or choose "Mark all as read".')
  } catch (error) {
    console.error('Update notification error:', error)
    return internalError('updating notification')
  }
}
