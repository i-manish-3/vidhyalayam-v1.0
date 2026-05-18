import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/roles - List all roles for the school (with permission counts)
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    // SUPER_ADMIN bypasses permission checks
    if (user.role !== 'SUPER_ADMIN') {
      const permCheck = await requirePermission(request, 'role:read')
      if (!permCheck) {
        return forbiddenError()
      }
    }

    const roles = await db.role.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: { permissions: true, userRoles: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    })

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
      })),
    })
  } catch (error) {
    console.error('List roles error:', error)
    return internalError('listing roles')
  }
}

// POST /api/school/roles - Create a new role (SUPER_ADMIN only)
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { name, description, color } = body

    if (!name || !name.trim()) {
      return apiError(400, 'Please enter a name for this role.')
    }

    // Block reserved role names
    const RESERVED_ROLE_NAMES = new Set(['School Admin', 'Staff'])
    if (RESERVED_ROLE_NAMES.has(name.trim())) {
      return apiError(400, `The name "${name.trim()}" is reserved for system use. Please choose a different name.`)
    }

    // Check for duplicate role name in the same school
    const existingRole = await db.role.findFirst({
      where: {
        schoolId: user.schoolId,
        name: name.trim(),
        deletedAt: null,
      },
    })
    if (existingRole) {
      return apiError(409, `A role named "${name.trim()}" already exists. Please choose a different name.`)
    }

    const role = await db.role.create({
      data: {
        schoolId: user.schoolId,
        name: name.trim(),
        description: description?.trim() || null,
        color: color || null,
        isSystem: false,
      },
      include: {
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
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create role error:', error)
    return internalError('creating the role')
  }
}
