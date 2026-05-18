import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/super-admin/roles - List all roles across all schools (with permission counts)
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const schoolId = searchParams.get('schoolId')
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {
      deletedAt: null,
    }

    if (schoolId) {
      where.schoolId = schoolId
    }

    if (search) {
      where.name = { contains: search }
    }

    const [roles, total] = await Promise.all([
      db.role.findMany({
        where,
        include: {
          school: {
            select: { id: true, name: true, primaryColor: true },
          },
          _count: {
            select: { permissions: true, userRoles: true },
          },
        },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.role.count({ where }),
    ])

    return NextResponse.json({
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        color: role.color,
        isSystem: role.isSystem,
        isActive: role.isActive,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
        permissionCount: role._count.permissions,
        userCount: role._count.userRoles,
        school: role.school ? {
          id: role.school.id,
          name: role.school.name,
          primaryColor: role.school.primaryColor,
        } : null,
      })),
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error('List super-admin roles error:', error)
    return internalError('listing roles')
  }
}

// POST /api/super-admin/roles - Create a new role for a specific school
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { schoolId, name, description, color } = body

    if (!schoolId) {
      return apiError(400, 'Please select a school to create the role in.')
    }

    if (!name || !name.trim()) {
      return apiError(400, 'Please enter a name for this role.')
    }

    // Verify school exists
    const school = await db.school.findFirst({
      where: { id: schoolId, deletedAt: null },
    })
    if (!school) {
      return apiError(404, 'We couldn\'t find this school. It may have been removed.')
    }

    // Check for duplicate role name in the same school
    const existingRole = await db.role.findFirst({
      where: {
        schoolId,
        name: name.trim(),
        deletedAt: null,
      },
    })
    if (existingRole) {
      return apiError(409, `A role with the name "${name.trim()}" already exists in this school.`)
    }

    const role = await db.role.create({
      data: {
        schoolId,
        name: name.trim(),
        description: description?.trim() || null,
        color: color || null,
        isSystem: false,
        isActive: true,
      },
      include: {
        school: {
          select: { id: true, name: true, primaryColor: true },
        },
        _count: {
          select: { permissions: true, userRoles: true },
        },
      },
    })

    return NextResponse.json(
      {
        id: role.id,
        name: role.name,
        description: role.description,
        color: role.color,
        isSystem: role.isSystem,
        isActive: role.isActive,
        createdAt: role.createdAt,
        permissionCount: role._count.permissions,
        userCount: role._count.userRoles,
        school: role.school ? {
          id: role.school.id,
          name: role.school.name,
          primaryColor: role.school.primaryColor,
        } : null,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create super-admin role error:', error)
    return internalError('creating the role')
  }
}
