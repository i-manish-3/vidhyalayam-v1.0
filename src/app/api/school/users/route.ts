import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// Mapping of predefined role names to User.role values
const ROLE_NAME_TO_USER_ROLE: Record<string, string> = {
  'Teacher': 'TEACHER',
  'Student': 'STUDENT',
  'Parent': 'PARENT',
  'School Admin': 'SCHOOL_ADMIN',
  'Principal': 'STAFF',
  'Manager': 'STAFF',
  'Accountant': 'STAFF',
  'Sr. Accountant': 'STAFF',
  'Librarian': 'STAFF',
  'Office Controller': 'STAFF',
  'Reception': 'STAFF',
  'Transport': 'STAFF',
  'Security': 'STAFF',
}

// Roles that cannot be assigned via staff creation
// School Admin is singular and managed only by Super Admin
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

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
      isActive: true,
      role: { not: 'SUPER_ADMIN' },
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
      },
      orderBy: [{ name: 'asc' }],
      take: limit,
    })

    return NextResponse.json({ users })
  } catch (error) {
    console.error('List school users error:', error)
    return internalError('listing school users')
  }
}

// POST /api/school/users - Create a new user with automatic role assignment
export async function POST(request: NextRequest) {
  try {
    const authUser = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!authUser || !authUser.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { name, email, password, phone, roleId } = body

    if (!name || !email || !password || !roleId) {
      return apiError(400, "Please fill in the staff member's name, email, password, and select a role.")
    }

    // Check if email is already taken
    const existingUser = await db.user.findUnique({
      where: { email },
    })
    if (existingUser) {
      return apiError(400, 'An account with this email already exists. Please use a different email address.')
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

    // Block restricted roles from being assigned via staff creation
    // Only SUPER_ADMIN can assign School Admin role
    if (RESTRICTED_STAFF_ROLES.has(role.name) && authUser.role !== 'SUPER_ADMIN') {
      return apiError(403, `The "${role.name}" role is assigned automatically and can't be selected here. Please choose a different role. ${role.name === 'School Admin' ? 'School Admin permissions are managed exclusively by Super Admin.' : 'This role is auto-assigned through other processes.'}`)
    }

    // Determine User.role from the predefined role name
    const userRole = ROLE_NAME_TO_USER_ROLE[role.name] || 'STAFF'

    // Hash the password
    const hashedPwd = await hashPassword(password)

    // Create user and assign role in a transaction
    const newUser = await db.$transaction(async (tx) => {
      // Create the user
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPwd,
          name: name.trim(),
          phone: phone || null,
          role: userRole,
          schoolId: authUser.schoolId!,
          isActive: true,
        },
      })

      // Automatically assign the user to the selected role
      // This means the user inherits ALL permissions from this role
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
        message: `User created and automatically assigned to "${role.name}" role. They inherit all permissions from this role.`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create school user error:', error)
    return internalError('creating the user')
  }
}
