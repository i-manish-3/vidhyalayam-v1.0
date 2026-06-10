import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'
import { getActiveBannersForUser } from '@/lib/platform-announcements'

// GET /api/platform/announcements/active — banners currently visible to the
// authenticated user (any role). Audience + dismissal filtering applied.
export async function GET(request: NextRequest) {
  try {
    const user = getAuthUser(request)
    if (!user) return unauthorizedError()

    const banners = await getActiveBannersForUser(user.userId, user.role)
    return NextResponse.json({ banners })
  } catch (error) {
    console.error('Load active platform announcements error:', error)
    return internalError('loading announcements')
  }
}
