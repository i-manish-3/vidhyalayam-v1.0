import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError } from '@/lib/api-errors'
import {
  manualUnlock,
  getClientIp,
  getUserAgent,
  logLoginEvent,
} from '@/lib/auth-security'

// POST /api/super-admin/users/[id]/unlock
// SUPER_ADMIN can unlock ANY user — including locked SCHOOL_ADMINs and other
// SUPER_ADMINs. This is the escalation path when a school admin gets locked
// out and the 10-minute auto-expiry isn't acceptable.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const requester = requireRole(request, ['SUPER_ADMIN'])
    if (!requester) {
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

    await manualUnlock(target.id, requester.userId)

    await logLoginEvent({
      userId: target.id,
      email: target.email,
      schoolId: target.schoolId,
      ipAddress: getClientIp(request),
      userAgent: `manual-unlock by SUPER_ADMIN ${requester.userId} | ${getUserAgent(request)}`,
      success: true,
    })

    return NextResponse.json({
      message: `Account unlocked for ${target.email}. They can now log in immediately.`,
    })
  } catch (error) {
    console.error('Super-admin unlock user error:', error)
    return internalError('unlocking the account')
  }
}
