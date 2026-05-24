import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { uploadIfDataUrl, IMAGE_MIME_TYPES } from '@/lib/storage'

// Roles that cannot be assigned via staff creation
// Staff creation always creates a STAFF account, then assigns a staff permission role.
const RESTRICTED_STAFF_ROLES = new Set(['School Admin', 'Student', 'Parent', 'Staff'])

// GET /api/school/users - List all users in the school (for role assignment)
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const limit = parseInt(searchParams.get('limit') || '100')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const rolesParam = searchParams.get('roles') || ''

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
      isActive: true,
      role: { not: 'SUPER_ADMIN' },
    }

    // Optional server-side filter by base role (comma-separated, e.g. "TEACHER,STAFF").
    // Without this, callers paginating by limit can lose staff behind hundreds of
    // STUDENT / PARENT rows that share the same endpoint.
    if (rolesParam) {
      const roles = rolesParam.split(',').map(r => r.trim()).filter(Boolean)
      if (roles.length > 0) {
        where.role = { in: roles }
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          accountLockout: {
            select: { lockedUntil: true, failedAttempts: true },
          },
          userRoles: {
            select: {
              role: {
                select: { id: true, name: true, color: true },
              },
            },
          },
        },
        orderBy: [{ name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.user.count({ where }),
    ])

    const now = Date.now()
    const shaped = users.map(u => {
      const lockedUntil = u.accountLockout?.lockedUntil ?? null
      const isLocked = !!lockedUntil && lockedUntil.getTime() > now
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isActive: u.isActive,
        isLocked,
        lockedUntil: isLocked ? lockedUntil : null,
        failedAttempts: u.accountLockout?.failedAttempts ?? 0,
        assignedRoles: u.userRoles.map(ur => ({
          id: ur.role.id,
          name: ur.role.name,
          color: ur.role.color,
        })),
      }
    })

    return NextResponse.json({
      users: shaped,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    })
  } catch (error) {
    console.error('List school users error:', error)
    return internalError('listing school users')
  }
}

// POST /api/school/users - Create a new staff user with automatic role assignment.
// Staff are identified by phone number (used as the login id). A synthetic
// email `<phone>@staff.local` is stored to satisfy the unique email constraint
// (same trick used for parent accounts with `@parent.local`). The password is
// always set to the default `staff123` — staff must change it on first login
// via the existing `mustChangePassword` flow.
export async function POST(request: NextRequest) {
  try {
    const authUser = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!authUser || !authUser.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { name, phone, email, dob, avatar, roleId } = body

    if (!name || !phone || !dob || !roleId) {
      return apiError(400, "Please fill in the staff member's name, phone number, date of birth, and select a role.")
    }

    const normalizedPhone = String(phone).replace(/\D/g, '').slice(-10)
    if (normalizedPhone.length !== 10) {
      return apiError(400, 'Please enter a valid 10-digit phone number.')
    }

    const dobDate = new Date(dob)
    if (isNaN(dobDate.getTime())) {
      return apiError(400, 'Please enter a valid date of birth.')
    }

    // Phone is the real login identifier — block duplicates within the school
    // (and globally, since `phone` is what login uses to find the user).
    const existingByPhone = await db.user.findFirst({
      where: { phone: normalizedPhone, deletedAt: null },
    })
    if (existingByPhone) {
      return apiError(400, 'An account with this phone number already exists. Please use a different phone number.')
    }

    // Email is optional. When provided, validate format + uniqueness and use
    // it as the User.email. Otherwise fall back to a synthetic
    // `<phone>@staff.local` (same pattern as parent accounts) to satisfy the
    // unique email constraint.
    const trimmedEmail = typeof email === 'string' ? email.trim() : ''
    let finalEmail: string
    if (trimmedEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        return apiError(400, 'Please enter a valid email address.')
      }
      const existingByEmail = await db.user.findUnique({ where: { email: trimmedEmail } })
      if (existingByEmail) {
        return apiError(400, 'An account with this email already exists. Please use a different email.')
      }
      finalEmail = trimmedEmail
    } else {
      const syntheticEmail = `${normalizedPhone}@staff.local`
      const existingByEmail = await db.user.findUnique({ where: { email: syntheticEmail } })
      if (existingByEmail) {
        return apiError(400, 'An account with this phone number already exists. Please use a different phone number.')
      }
      finalEmail = syntheticEmail
    }

    // Validate the role belongs to this school
    const role = await db.role.findFirst({
      where: {
        id: roleId,
        schoolId: authUser.schoolId,
        deletedAt: null,
        isActive: true,
      },
    })
    if (!role) {
      return apiError(400, "The role you selected doesn't exist in your school. Please refresh and try again.")
    }

    // Block identity/system roles from staff creation for every admin.
    if (RESTRICTED_STAFF_ROLES.has(role.name) || role.name === 'Teacher') {
      return apiError(403, `The "${role.name}" role cannot be selected while creating staff. Please choose a staff permission role like Accountant, Reception, or a custom staff role.`)
    }

    const hashedPwd = await hashPassword('staff123')

    const avatarUpload = await uploadIfDataUrl(avatar, {
      folder: `schools/${authUser.schoolId}/avatars`,
      maxBytes: 1024 * 1024,
      allowedMimeTypes: IMAGE_MIME_TYPES,
    })
    if (avatarUpload.error) {
      return apiError(400, `Avatar: ${avatarUpload.error}`)
    }

    const newUser = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: finalEmail,
          password: hashedPwd,
          name: name.trim(),
          phone: normalizedPhone,
          dob: dobDate,
          avatar: avatarUpload.url ?? null,
          role: 'STAFF',
          schoolId: authUser.schoolId!,
          isActive: true,
          mustChangePassword: true,
        },
      })

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          assignedBy: authUser.userId,
        },
      })

      return user
    })

    return NextResponse.json(
      {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        isActive: newUser.isActive,
        assignedRole: {
          id: role.id,
          name: role.name,
          description: role.description,
          color: role.color,
        },
        message: `Staff member created with default password "staff123". They must change it on first login.`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create school user error:', error)
    return internalError('creating the user')
  }
}
