import { NextRequest, NextResponse } from 'next/server'
import { setAuthCookies } from '@/lib/cookies'
import { internalError, apiError } from '@/lib/api-errors'
import { getClientIp, getUserAgent } from '@/lib/auth-security'
import {
  authenticateCredentials,
  issueTokensForLogin,
  toAuthUserJson,
} from '@/lib/auth-core'

// Web login. Credential checks, lockout, and auditing are shared with the
// mobile endpoint via auth-core; this route's only job is to put the issued
// tokens into HttpOnly cookies (so client JavaScript never sees the raw JWT)
// and return the user metadata.
export async function POST(request: NextRequest) {
  const ipAddress = getClientIp(request)
  const userAgent = getUserAgent(request)

  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return apiError(400, 'Please enter your email or phone number and password to log in.')
    }

    const result = await authenticateCredentials(String(email).trim(), password, { ipAddress, userAgent })

    if (!result.ok) {
      // Lockout (423) keeps its original body shape (`{ error }`) and the
      // Retry-After header so existing clients behave exactly as before.
      if (result.status === 423) {
        return NextResponse.json(
          { error: result.message },
          { status: 423, headers: { 'Retry-After': String(result.retryAfterSec ?? 600) } },
        )
      }
      return apiError(result.status, result.message)
    }

    const { accessToken, refreshToken } = issueTokensForLogin(result.user)

    const response = NextResponse.json({ user: toAuthUserJson(result.user) })
    setAuthCookies(response, accessToken, refreshToken)
    return response
  } catch (error) {
    console.error('Login error:', error)
    return internalError('logging you in')
  }
}
