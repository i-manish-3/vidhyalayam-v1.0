import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

const VIEW_ROLES = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF', 'STUDENT', 'PARENT']

// Returns true if the authenticated user may see/mutate this notification row.
function canAccess(
  target: { userId: string | null; schoolId: string | null },
  user: { userId: string; role: string; schoolId?: string },
): boolean {
  if (target.userId === user.userId) return true
  if (target.userId === null) {
    return user.role === 'SUPER_ADMIN' ? target.schoolId === null : target.schoolId === user.schoolId
  }
  return false
}

// GET /api/school/notifications/[id] - notification detail (own only)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRole(request, VIEW_ROLES)
    if (!user) return unauthorizedError()
    const { id } = await params

    const notification = await db.notification.findUnique({ where: { id } })
    if (!notification) return apiError(404, 'Notification not found.')
    if (!canAccess(notification, user)) return apiError(403, 'You can only view your own notifications.')

    return NextResponse.json({ notification })
  } catch (error) {
    console.error('Get notification error:', error)
    return internalError('loading the notification')
  }
}

// DELETE /api/school/notifications/[id] - archive (soft) the notification (own only)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRole(request, VIEW_ROLES)
    if (!user) return unauthorizedError()
    const { id } = await params

    const notification = await db.notification.findUnique({
      where: { id },
      select: { userId: true, schoolId: true },
    })
    if (!notification) return apiError(404, 'Notification not found.')
    if (!canAccess(notification, user)) return apiError(403, 'You can only delete your own notifications.')

    await db.notification.update({ where: { id }, data: { archivedAt: new Date() } })
    return NextResponse.json({ success: true, message: 'Notification archived' })
  } catch (error) {
    console.error('Delete notification error:', error)
    return internalError('deleting the notification')
  }
}
