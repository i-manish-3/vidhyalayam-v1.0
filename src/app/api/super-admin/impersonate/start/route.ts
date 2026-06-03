import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { generateAccessToken } from '@/lib/auth'
import { ACCESS_COOKIE } from '@/lib/cookies'
import { unauthorizedError, forbiddenError, internalError, apiError } from '@/lib/api-errors'

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUser(request)
    if (!user) return unauthorizedError()
    if (user.role !== 'SUPER_ADMIN') return forbiddenError()

    const { schoolId } = await request.json()
    if (!schoolId) return apiError(400, 'schoolId is required.')

    const school = await db.school.findFirst({
      where: { id: schoolId, deletedAt: null },
      select: { id: true, name: true },
    })
    if (!school) return apiError(404, 'School not found.')

    // Persist impersonation so the refresh route can re-read it
    await db.user.update({
      where: { id: user.userId },
      data: { impersonatingSchoolId: school.id },
    })

    const newAccess = generateAccessToken({
      userId: user.userId,
      email: user.email,
      role: user.role,
      schoolId: school.id,
      impersonatingSchoolId: school.id,
    })

    const res = NextResponse.json({ school })
    res.cookies.set(ACCESS_COOKIE, newAccess, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    })
    return res
  } catch (error) {
    console.error('Impersonate start error:', error)
    return internalError('starting impersonation')
  }
}
