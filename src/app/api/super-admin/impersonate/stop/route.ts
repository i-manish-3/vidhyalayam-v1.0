import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { generateAccessToken } from '@/lib/auth'
import { ACCESS_COOKIE } from '@/lib/cookies'
import { unauthorizedError, forbiddenError, internalError } from '@/lib/api-errors'

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUser(request)
    if (!user) return unauthorizedError()
    if (user.role !== 'SUPER_ADMIN') return forbiddenError()

    await db.user.update({
      where: { id: user.userId },
      data: { impersonatingSchoolId: null },
    })

    const newAccess = generateAccessToken({
      userId: user.userId,
      email: user.email,
      role: user.role,
      schoolId: undefined,
    })

    const res = NextResponse.json({ ok: true })
    res.cookies.set(ACCESS_COOKIE, newAccess, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    })
    return res
  } catch (error) {
    console.error('Impersonate stop error:', error)
    return internalError('stopping impersonation')
  }
}
