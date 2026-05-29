import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { assignUserToRoleByName, provisionDefaultRolesForSchool } from '@/lib/rbac'
import { validatePasswordStrength } from '@/lib/auth-security'

// GET /api/super-admin/schools - List all schools with stats
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const archived = searchParams.get('archived') === 'true'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = archived
      ? { deletedAt: { not: null } }
      : { deletedAt: null }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { subdomain: { contains: search } },
        { contactEmail: { contains: search } },
        { city: { contains: search } },
      ]
    }

    if (status && !archived) {
      where.status = status
    }

    const [schools, total] = await Promise.all([
      db.school.findMany({
        where,
        include: {
          _count: {
            select: {
              students: { where: { deletedAt: null } },
              teachers: { where: { deletedAt: null } },
            },
          },
          users: {
            where: archived
              ? { role: 'SCHOOL_ADMIN' }
              : { role: 'SCHOOL_ADMIN', deletedAt: null },
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.school.count({ where }),
    ])

    const schoolsWithStats = schools.map((school) => ({
      id: school.id,
      name: school.name,
      logo: school.logo,
      address: school.address,
      city: school.city,
      state: school.state,
      contactPhone: school.contactPhone,
      contactEmail: school.contactEmail,
      subdomain: school.subdomain,
      status: school.status,
      trialEndsAt: school.trialEndsAt,
      onboardingDate: school.onboardingDate,
      academicYear: school.academicYear,
      board: school.board,
      studentCount: school._count.students,
      teacherCount: school._count.teachers,
      admin: school.users[0] || null,
      createdAt: school.createdAt,
      deletedAt: school.deletedAt,
    }))

    return NextResponse.json({
      schools: schoolsWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List schools error:', error)
    return internalError('listing schools')
  }
}


// POST /api/super-admin/schools - Create new school with full provisioning
export async function POST(request: NextRequest) {
  try {
    const authUser = requireRole(request, ['SUPER_ADMIN'])
    if (!authUser) {
      return unauthorizedError()
    }

    const body = await request.json()
    const {
      name,
      subdomain,
      address,
      city,
      state,
      pincode,
      country,
      contactPhone,
      contactEmail,
      website,
      academicYear,
      board,
      timezone,
      currency,
      primaryColor,
      dashboardFont,
      adminName,
      adminEmail,
      adminPassword,
      adminPhone,
      permissionIds,
      trialDays,
    } = body

    if (!name || !subdomain || !adminName || !adminEmail || !adminPassword) {
      return apiError(400, 'Please fill in the school name, subdomain, admin name, admin email, and password.')
    }

    const strength = validatePasswordStrength(adminPassword)
    if (!strength.valid) {
      return apiError(400, strength.reason || 'Please choose a stronger admin password.')
    }

    // Check if subdomain is taken
    const existingSchool = await db.school.findUnique({
      where: { subdomain },
    })
    if (existingSchool) {
      return apiError(400, 'This subdomain is already taken by another school. Please choose a different one.')
    }

    // Check if admin email is taken
    const existingUser = await db.user.findUnique({
      where: { email: adminEmail },
    })
    if (existingUser) {
      return apiError(400, 'An account with this email already exists. Please use a different email address.')
    }

    const hashedPwd = await hashPassword(adminPassword)

    // Determine initial status
    const initialStatus = body.status || 'trial'
    const initialAcademicYear = academicYear || '2025-2026'

    // Trial duration (days). Admin chooses; default 14, allow 1–365.
    const trialDaysNum = Number(trialDays)
    const safeTrialDays =
      Number.isFinite(trialDaysNum) && trialDaysNum >= 1 && trialDaysNum <= 365
        ? Math.floor(trialDaysNum)
        : 14
    const trialEndsAt =
      initialStatus === 'trial'
        ? new Date(Date.now() + safeTrialDays * 24 * 60 * 60 * 1000)
        : null

    // ========================================
    // Create school with full provisioning
    // ========================================
    const school = await db.school.create({
      data: {
        name,
        subdomain,
        address,
        city,
        state,
        pincode,
        country: country || 'India',
        contactPhone,
        contactEmail,
        website,
        academicYear: initialAcademicYear,
        board: board || 'CBSE',
        timezone: timezone || undefined,
        currency: currency || undefined,
        primaryColor: primaryColor || undefined,
        dashboardFont: dashboardFont || undefined,
        status: initialStatus,
        trialEndsAt,
        onboardingDate: new Date(),
        users: {
          create: {
            email: adminEmail,
            password: hashedPwd,
            name: adminName,
            phone: adminPhone,
            role: 'SCHOOL_ADMIN',
            isActive: true,
          },
        },
        // Create default admission settings
        admissionSetting: {
          create: {
            academicYear: initialAcademicYear,
          },
        },
        academicYears: {
          create: {
            name: initialAcademicYear,
            isCurrent: true,
            isActive: true,
          },
        },
      },
      include: {
        users: true,
      },
    })

    const adminUser = school.users[0]
    const schoolId = school.id

    // ========================================
    // 1. Grant selected permissions to the school
    // ========================================
    // If permissionIds provided, only grant those; otherwise grant ALL (backward compat)
    const allPermissions = await db.permission.findMany({
      where: { isActive: true },
      select: { id: true, code: true },
    })

    const selectedPermIds: string[] = Array.isArray(permissionIds) && permissionIds.length > 0
      ? permissionIds
      : allPermissions.map((p) => p.id)

    // Build a set of granted permission IDs for quick lookup
    const grantedPermIdSet = new Set(selectedPermIds)

    // Only grant the selected permissions
    const grantedPermissions = allPermissions.filter((p) => grantedPermIdSet.has(p.id))

    if (grantedPermissions.length > 0) {
      await db.schoolPermission.createMany({
        data: grantedPermissions.map((p) => ({
          schoolId,
          permissionId: p.id,
          grantedBy: authUser.userId,
        })),
      })
    }

    // ========================================
    // 2. Create predefined roles and assign school admin role
    // ========================================
    const createdRoles = await db.$transaction(async (tx) => {
      const roles = await provisionDefaultRolesForSchool(schoolId, tx)
      await assignUserToRoleByName(adminUser.id, schoolId, 'School Admin', authUser.userId, tx)
      return roles
    })

    return NextResponse.json(
      {
        school: {
          id: school.id,
          name: school.name,
          subdomain: school.subdomain,
          status: school.status,
          trialEndsAt: school.trialEndsAt,
        },
        admin: {
          id: adminUser.id,
          name: adminUser.name,
          email: adminUser.email,
        },
        provisioning: {
          permissionsGranted: grantedPermissions.length,
          rolesCreated: createdRoles.length,
          admissionSettingsCreated: true,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create school error:', error)
    return internalError('creating the school')
  }
}
