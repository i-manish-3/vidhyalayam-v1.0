import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth'
import { ACCESS_COOKIE, clearAuthCookies } from '@/lib/cookies'

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
]

const CORS_ALLOWED_ORIGINS = new Set(
  (process.env.API_CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .concat(DEFAULT_CORS_ORIGINS),
)

const CORS_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'Accept',
  'Origin',
  'X-Requested-With',
  'ngrok-skip-browser-warning',
].join(', ')

function applyCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get('origin')
  if (!origin || !CORS_ALLOWED_ORIGINS.has(origin)) return response

  response.headers.set('Access-Control-Allow-Origin', origin)
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS)
  response.headers.set('Access-Control-Max-Age', '86400')
  response.headers.append('Vary', 'Origin')

  return response
}

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (request.method === 'OPTIONS') {
    return applyCors(request, new NextResponse(null, { status: 204 }))
  }

  if (SKIP_PATHS.has(pathname)) {
    return applyCors(request, NextResponse.next())
  }

  const token = request.cookies.get(ACCESS_COOKIE)?.value
  if (!token) return applyCors(request, NextResponse.next())

  const payload = verifyAccessToken(token)
  // No payload = bad/expired token; no schoolId = SUPER_ADMIN. Either way the
  // suspension gate doesn't apply — let the route handler do its thing.
  if (!payload?.schoolId) return applyCors(request, NextResponse.next())

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
    return applyCors(request, res)
  }

  return applyCors(request, NextResponse.next())
}

// Run on /api/* only. Static assets, pages, and image optimization are untouched.
// Next.js 16 proxy always runs on Node.js — no runtime config needed.
export const config = {
  matcher: '/api/:path*',
}
