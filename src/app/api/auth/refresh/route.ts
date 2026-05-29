import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '@/lib/auth'
import { REFRESH_COOKIE, setAuthCookies, clearAuthCookies } from '@/lib/cookies'
import { apiError, internalError } from '@/lib/api-errors'

// Sliding-session refresh. Reads the refresh cookie, re-verifies the user
// against the DB (so a disabled/deleted user stops getting new access tokens
// even if their refresh token hasn't expired), and re-issues both cookies.
//
// Re-issuing the refresh token (not just the access token) is what makes the
// session "slide" — an active user effectively never logs out, while an
// inactive user falls off after 30 days because nothing is renewing their
// refresh token.
export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
    if (!refreshToken) {
      return apiError(401, 'No refresh token. Please log in again.')
    }

    const payload = verifyRefreshToken(refreshToken)
    if (!payload) {
      // Cookie was forged, tampered, or expired (>30 days inactive). Clear
      // both cookies so the client doesn't keep trying with a bad refresh
      // token on every request.
      const res = apiError(401, 'Your session has expired. Please log in again.')
      clearAuthCookies(res)
      return res
    }

    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        schoolId: true,
        impersonatingSchoolId: true,
        isActive: true,
        deletedAt: true,
        school: { select: { status: true } },
      },
    })

    if (!user || !user.isActive || user.deletedAt) {
      // User was deactivated/deleted since they last logged in. Refuse to
      // hand out new tokens and clear cookies so the client logs out cleanly.
      const res = apiError(401, 'Your account is no longer active. Please contact your school administrator.')
      clearAuthCookies(res)
      return res
    }

    if (user.school?.status === 'suspended') {
      // School was suspended by a super admin since this session was issued.
      // Boot the user out — they can log in again once the school is reactivated.
      const res = apiError(401, 'Your school is currently suspended. Please contact the platform administrator to restore access.')
      clearAuthCookies(res)
      return res
    }

    const effectiveSchoolId = user.impersonatingSchoolId || user.schoolId || undefined
    const newAccess = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      schoolId: effectiveSchoolId,
      ...(user.impersonatingSchoolId ? { impersonatingSchoolId: user.impersonatingSchoolId } : {}),
    })
    const newRefresh = generateRefreshToken(user.id)

    const response = NextResponse.json({ ok: true })
    setAuthCookies(response, newAccess, newRefresh)
    return response
  } catch (error) {
    console.error('Refresh token error:', error)
    return internalError('refreshing your session')
  }
}
