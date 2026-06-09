import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'
import { calculateRecipients, type NotificationTarget } from '@/lib/notifications'

// POST /api/school/notifications/preview-recipients
// Body: { target: NotificationTarget }
// Returns the deduped recipient count + a small sample (for the confirm step).
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'notification:send')
    if (!user || !user.schoolId) return unauthorizedError()

    const body = await request.json()
    const target = (body.target ?? {}) as NotificationTarget

    const recipientIds = await calculateRecipients(user.schoolId, target)

    const sample = await db.user.findMany({
      where: { id: { in: recipientIds.slice(0, 10) } },
      select: { id: true, name: true, email: true, role: true },
    })

    return NextResponse.json({
      count: recipientIds.length,
      sample,
    })
  } catch (error) {
    console.error('Preview recipients error:', error)
    return internalError('previewing recipients')
  }
}
