import { NextRequest, NextResponse } from 'next/server'
import { apiError, internalError } from '@/lib/api-errors'
import { refreshSession } from '@/lib/auth-core'

// Mobile sliding-session refresh. Same verification + token-rotation as the web
// route (shared via auth-core), but the refresh token arrives in the request
// body (read from expo-secure-store by the client) and the new token pair is
// returned in the body. On failure the client clears its stored tokens and
// sends the user back to the login screen.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const refreshToken =
      body && typeof body === 'object' && typeof (body as Record<string, unknown>).refreshToken === 'string'
        ? ((body as Record<string, unknown>).refreshToken as string)
        : undefined

    const result = await refreshSession(refreshToken)
    if (!result.ok) {
      return apiError(result.status, result.message)
    }

    return NextResponse.json({
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    })
  } catch (error) {
    console.error('Mobile refresh error:', error)
    return internalError('refreshing your session')
  }
}
