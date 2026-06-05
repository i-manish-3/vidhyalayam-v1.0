import { NextRequest, NextResponse } from 'next/server'
import { internalError, apiError } from '@/lib/api-errors'
import { getClientIp, getUserAgent } from '@/lib/auth-security'
import {
  authenticateCredentials,
  issueTokensForLogin,
  toAuthUserJson,
} from '@/lib/auth-core'

// Mobile (React Native / Expo) login. Identical credential checks, lockout, and
// auditing as the web route (shared via auth-core) — the only difference is the
// transport: native clients can't use HttpOnly cookies, so the access + refresh
// tokens are returned in the JSON body. The app stores them in expo-secure-store
// and sends the access token as `Authorization: Bearer <token>` on every
// request (see getAuthUser in src/lib/api-auth.ts).
export async function POST(request: NextRequest) {
  const ipAddress = getClientIp(request)
  const userAgent = getUserAgent(request)

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError(400, 'Please enter your email or phone number and password to log in.')
    }

    // Accept both `emailOrPhone` (mobile field name) and `email` (parity with web).
    const identifierRaw = (body as Record<string, unknown>).emailOrPhone ?? (body as Record<string, unknown>).email
    const password = (body as Record<string, unknown>).password

    if (typeof identifierRaw !== 'string' || typeof password !== 'string' || !identifierRaw || !password) {
      return apiError(400, 'Please enter your email or phone number and password to log in.')
    }

    const result = await authenticateCredentials(identifierRaw.trim(), password, { ipAddress, userAgent })

    if (!result.ok) {
      if (result.status === 423) {
        return NextResponse.json(
          { message: result.message },
          { status: 423, headers: { 'Retry-After': String(result.retryAfterSec ?? 600) } },
        )
      }
      return apiError(result.status, result.message)
    }

    const { accessToken, refreshToken } = issueTokensForLogin(result.user)

    // Tokens in the body — no cookies for the native client.
    return NextResponse.json({
      user: toAuthUserJson(result.user),
      accessToken,
      refreshToken,
    })
  } catch (error) {
    console.error('Mobile login error:', error)
    return internalError('logging you in')
  }
}
