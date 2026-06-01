import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { ingestTap } from '@/lib/attendance-tap-service'

/**
 * POST /api/school/attendance/tap
 *
 * Kiosk-mode tap ingestion. Authenticates via the standard JWT cookie
 * (a TEACHER/STAFF/SCHOOL_ADMIN is signed in on the kiosk PC); schoolId
 * comes from the verified token. The endpoint just unpacks the body and
 * delegates to the shared `ingestTap()` service that the webhook endpoint
 * also uses, so behaviour stays in lock-step.
 *
 * Body: { uid: string, tappedAt?: ISO8601 }
 */
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError(400, 'Tap payload missing.')
    }

    const rawUid = typeof body.uid === 'string' ? body.uid : ''
    if (!rawUid) return apiError(400, 'Card UID missing.')

    let tappedAt: Date | undefined
    if (typeof body.tappedAt === 'string') {
      const parsed = new Date(body.tappedAt)
      if (!Number.isNaN(parsed.getTime())) tappedAt = parsed
    }

    const result = await ingestTap({
      schoolId: user.schoolId,
      uid: rawUid,
      source: 'kiosk',
      performedBy: user.userId,
      tappedAt,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Kiosk tap error:', error)
    return internalError('processing the tap')
  }
}
