import { NextResponse } from 'next/server'
import { clearAuthCookies } from '@/lib/cookies'

// Pure cookie-clear. JWTs are stateless so there's no server-side session to
// invalidate — clearing the cookies is sufficient for this user's browser to
// stop being authenticated. A device-wide "log out everywhere" would need
// DB-backed sessions (deferred).
export async function POST() {
  const response = NextResponse.json({ ok: true })
  clearAuthCookies(response)
  return response
}
