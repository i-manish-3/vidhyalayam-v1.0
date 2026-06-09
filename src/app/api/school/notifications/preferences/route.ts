import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

const ROLES = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF', 'STUDENT', 'PARENT']
const CHANNELS = ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'WEB_PUSH', 'MOBILE_PUSH']

// GET /api/school/notifications/preferences - current user's channel/category prefs
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ROLES)
    if (!user) return unauthorizedError()

    const preferences = await db.notificationPreference.findMany({
      where: { userId: user.userId },
      orderBy: [{ category: 'asc' }, { channel: 'asc' }],
    })
    return NextResponse.json({ preferences, channels: CHANNELS })
  } catch (error) {
    console.error('Get preferences error:', error)
    return internalError('loading notification preferences')
  }
}

// PATCH /api/school/notifications/preferences
// Body: { channel, category?, enabled, quietHoursStart?, quietHoursEnd? }
export async function PATCH(request: NextRequest) {
  try {
    const user = requireRole(request, ROLES)
    if (!user) return unauthorizedError()

    const body = await request.json()
    const { channel, category = 'all', enabled, quietHoursStart, quietHoursEnd } = body

    if (!channel || !CHANNELS.includes(channel)) {
      return apiError(400, 'Please specify a valid channel.')
    }
    if (typeof enabled !== 'boolean') {
      return apiError(400, 'Please specify whether this channel is enabled.')
    }

    const preference = await db.notificationPreference.upsert({
      where: { userId_channel_category: { userId: user.userId, channel, category } },
      update: { enabled, quietHoursStart: quietHoursStart ?? null, quietHoursEnd: quietHoursEnd ?? null },
      create: {
        userId: user.userId,
        schoolId: user.schoolId ?? null,
        channel,
        category,
        enabled,
        quietHoursStart: quietHoursStart ?? null,
        quietHoursEnd: quietHoursEnd ?? null,
      },
    })
    return NextResponse.json({ success: true, preference })
  } catch (error) {
    console.error('Update preferences error:', error)
    return internalError('updating notification preferences')
  }
}
