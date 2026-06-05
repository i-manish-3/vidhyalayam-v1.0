import { NextRequest, NextResponse } from 'next/server'
import { REFRESH_COOKIE, setAuthCookies, clearAuthCookies } from '@/lib/cookies'
import { apiError, internalError } from '@/lib/api-errors'
import { refreshSession } from '@/lib/auth-core'

// Web sliding-session refresh. The verification + token-rotation logic is shared
// with the mobile endpoint via auth-core; this route reads/writes HttpOnly
// cookies and clears them on any failure so a bad refresh token doesn't keep
// getting retried on every request.
export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value

    const result = await refreshSession(refreshToken)
    if (!result.ok) {
      const res = apiError(result.status, result.message)
      clearAuthCookies(res)
      return res
    }

    const response = NextResponse.json({ ok: true })
    setAuthCookies(response, result.tokens.accessToken, result.tokens.refreshToken)
    return response
  } catch (error) {
    console.error('Refresh token error:', error)
    return internalError('refreshing your session')
  }
}
