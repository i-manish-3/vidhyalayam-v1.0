// Centralized auth-cookie config. All set/clear of auth cookies goes through
// here so flag drift (e.g., one route forgetting HttpOnly) can't happen.
//
// Why two cookies:
//   - erp_access:  short-lived (15 min) — sent on every authenticated request.
//                  Compromise window is small even if a misconfigured CDN logs it.
//   - erp_refresh: long-lived (30 days, sliding) — only consumed by the refresh
//                  endpoint. Lets active users stay logged in indefinitely while
//                  inactive users get cleaned up after 30 days.
//
// Both are HttpOnly so XSS can't read them. SameSite=Lax sends them on top-level
// navigation (so email-link → app works) but not on cross-site fetch/POST,
// which neutralizes the common CSRF vector.

import { NextResponse } from 'next/server'

export const ACCESS_COOKIE = 'erp_access'
export const REFRESH_COOKIE = 'erp_refresh'

const ACCESS_TTL_SECONDS = 15 * 60               // 15 minutes
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60    // 30 days

function flags() {
  return {
    httpOnly: true,
    // Localhost is HTTP — Secure would prevent the browser from sending the
    // cookie back, breaking dev. In prod everything is HTTPS so this is on.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
}

export function setAuthCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookies.set(ACCESS_COOKIE, accessToken, { ...flags(), maxAge: ACCESS_TTL_SECONDS })
  res.cookies.set(REFRESH_COOKIE, refreshToken, { ...flags(), maxAge: REFRESH_TTL_SECONDS })
}

export function clearAuthCookies(res: NextResponse): void {
  // maxAge: 0 with matching path/sameSite is the documented way to delete a
  // cookie — the browser sees a value of '' that expires immediately.
  res.cookies.set(ACCESS_COOKIE, '', { ...flags(), maxAge: 0 })
  res.cookies.set(REFRESH_COOKIE, '', { ...flags(), maxAge: 0 })
}
