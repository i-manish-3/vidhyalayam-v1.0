import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { internalError } from '@/lib/api-errors'
import { hashResetToken, maskEmail } from '@/lib/password-reset'

// GET /api/auth/reset-password/verify?token=...
// Returns whether a reset token is still usable, plus a masked version of
// the target email so the UI can show "Resetting password for s***@example.com".
// Used by the reset page to render a friendly "link expired" state instead of
// dumping the user into a password form that will fail on submit.

type VerifyResult =
  | { valid: true; maskedEmail: string }
  | { valid: false; reason: 'invalid' | 'expired' | 'used' | 'ineligible' }

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.json({ valid: false, reason: 'invalid' } satisfies VerifyResult)
    }

    const tokenHash = hashResetToken(token)
    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            email: true,
            role: true,
            isActive: true,
            deletedAt: true,
            school: { select: { status: true } },
          },
        },
      },
    })

    const RESET_ELIGIBLE_ROLES = new Set(['SUPER_ADMIN', 'SCHOOL_ADMIN'])

    if (!record) {
      return NextResponse.json({ valid: false, reason: 'invalid' } satisfies VerifyResult)
    }

    if (record.usedAt) {
      return NextResponse.json({ valid: false, reason: 'used' } satisfies VerifyResult)
    }

    if (record.expiresAt <= new Date()) {
      return NextResponse.json({ valid: false, reason: 'expired' } satisfies VerifyResult)
    }

    if (
      !record.user ||
      !RESET_ELIGIBLE_ROLES.has(record.user.role) ||
      !record.user.isActive ||
      record.user.deletedAt ||
      record.user.school?.status === 'suspended'
    ) {
      return NextResponse.json({ valid: false, reason: 'ineligible' } satisfies VerifyResult)
    }

    return NextResponse.json({
      valid: true,
      maskedEmail: maskEmail(record.user.email),
    } satisfies VerifyResult)
  } catch (error) {
    console.error('Verify reset token error:', error)
    return internalError('verifying your reset link')
  }
}
