import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth'
import { ACCESS_COOKIE, clearAuthCookies } from '@/lib/cookies'

// Endpoints deliberately exempt from the school-suspension gate:
//   /api/auth/login   — login route checks school status itself and returns a
//                       descriptive 403; the gate here would only ever fire for
//                       an already-signed-in user retrying login.
//   /api/auth/refresh — has its own school check + cookie clear; must still run
//                       even when the access token has expired.
//   /api/auth/logout  — suspended users must still be able to sign out cleanly.
const SKIP_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
])

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (SKIP_PATHS.has(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(ACCESS_COOKIE)?.value
  if (!token) return NextResponse.next()

  const payload = verifyAccessToken(token)
  // No payload = bad/expired token; no schoolId = SUPER_ADMIN. Either way the
  // suspension gate doesn't apply — let the route handler do its thing.
  if (!payload?.schoolId) return NextResponse.next()

  const school = await db.school.findUnique({
    where: { id: payload.schoolId },
    select: { status: true },
  })

  if (school?.status === 'suspended') {
    const res = NextResponse.json(
      { error: 'Your school is currently suspended. Please contact the platform administrator to restore access.' },
      { status: 401 },
    )
    clearAuthCookies(res)
    return res
  }

  return NextResponse.next()
}

// Run on /api/* only. Static assets, pages, and image optimization are untouched.
export const config = {
  matcher: '/api/:path*',
  // Prisma is Node-only; the default Edge runtime can't import @/lib/db.
  runtime: 'nodejs',
}
