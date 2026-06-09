import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// POST /api/school/announcements/[id]/cancel - cancel a scheduled announcement
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'announcement:schedule')
    if (!user || !user.schoolId) return unauthorizedError()
    const { id } = await params

    const announcement = await db.announcement.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, status: true },
    })
    if (!announcement) return apiError(404, 'Announcement not found.')
    if (announcement.status !== 'scheduled') {
      return apiError(400, 'Only scheduled announcements can be cancelled.')
    }

    const updated = await db.announcement.update({
      where: { id },
      data: { status: 'cancelled' },
    })
    return NextResponse.json({ success: true, announcement: updated })
  } catch (error) {
    console.error('Cancel announcement error:', error)
    return internalError('cancelling the announcement')
  }
}
