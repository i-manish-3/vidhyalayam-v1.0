import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, apiError, internalError } from '@/lib/api-errors'
import {
  manualUnlock,
  getClientIp,
  getUserAgent,
  logLoginEvent,
} from '@/lib/auth-security'

// POST /api/school/users/[id]/unlock
// SCHOOL_ADMIN can unlock any non-admin user within their own school.
// SCHOOL_ADMIN cannot unlock another SCHOOL_ADMIN — that escalation requires
// SUPER_ADMIN (see /api/super-admin/users/[id]/unlock).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const requester = requireRole(request, ['SCHOOL_ADMIN'])
    if (!requester || !requester.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, phone: true, schoolId: true, role: true, deletedAt: true },
    })

    if (!target || target.deletedAt) {
      return notFoundError('User')
    }

    // Same-school scope check — admins can only unlock users in their school.
    if (target.schoolId !== requester.schoolId) {
      return apiError(403, 'You can only unlock users from your own school.')
    }

    // School admins cannot unlock other school admins. Forces accountability:
    // a peer admin can't quietly re-enable a colleague locked by suspicious activity.
    if (target.role === 'SCHOOL_ADMIN' || target.role === 'SUPER_ADMIN') {
      return apiError(403, 'Only a super admin can unlock another admin account.')
    }

    await manualUnlock(target.id, requester.userId)

    // Audit trail — log as a successful "login event" with reason metadata so
    // the row appears in the same timeline as the failures it follows.
    await logLoginEvent({
      userId: target.id,
      email: target.email,
      schoolId: target.schoolId,
      ipAddress: getClientIp(request),
      userAgent: `manual-unlock by ${requester.userId} | ${getUserAgent(request)}`,
      success: true,
    })

    return NextResponse.json({
      message: 'Account unlocked. The user can now log in immediately.',
    })
  } catch (error) {
    console.error('Unlock user error:', error)
    return internalError('unlocking the account')
  }
}
