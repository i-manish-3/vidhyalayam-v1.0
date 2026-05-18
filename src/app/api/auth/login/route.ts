import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, generateToken } from '@/lib/auth'
import { internalError, apiError } from '@/lib/api-errors'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return apiError(400, 'Please enter your email or phone number and password to log in.')
    }

    const identifier = String(email).trim()

    // Check if the identifier is a phone number (10+ digits)
    const isPhone = /^\d{10,}$/.test(identifier.replace(/\D/g, ''))

    // Find user by email or phone
    let user
    if (isPhone) {
      const phone = identifier.replace(/\D/g, '').slice(-10) // Last 10 digits
      user = await db.user.findFirst({
        where: { phone, isActive: true, deletedAt: null },
        include: { school: true },
      })
      // Also try finding by email with phone pattern (for parent accounts)
      if (!user) {
        user = await db.user.findFirst({
          where: { email: { endsWith: `@parent.local` }, phone, isActive: true, deletedAt: null },
          include: { school: true },
        })
      }
    } else {
      user = await db.user.findUnique({
        where: { email: identifier },
        include: { school: true },
      })
    }

    if (!user) {
      return apiError(401, 'No account found with this email or phone number. Please check and try again, or contact your school administrator.')
    }

    if (!user.isActive) {
      return apiError(403, 'Your account has been deactivated by your school administrator. Please contact them to reactivate your account.')
    }

    if (user.deletedAt) {
      return apiError(403, 'This account no longer exists. Please contact your school administrator for assistance.')
    }

    const isValid = await verifyPassword(password, user.password)
    if (!isValid) {
      return apiError(401, 'The password you entered is incorrect. Please try again.')
    }

    // Update lastLoginAt
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId || undefined,
    })

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        schoolId: user.schoolId,
        school: user.school
          ? {
              id: user.school.id,
              name: user.school.name,
              logo: user.school.logo,
              status: user.school.status,
              subdomain: user.school.subdomain,
              primaryColor: user.school.primaryColor,
              academicYear: user.school.academicYear,
            }
          : null,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return internalError('logging you in')
  }
}
