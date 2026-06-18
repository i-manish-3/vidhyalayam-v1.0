import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanColor(value: unknown): string {
  const color = typeof value === 'string' ? value.trim() : ''
  return HEX_COLOR.test(color) ? color : '#2563eb'
}

// GET /api/school/student-houses - List school houses with student counts
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN' && user.role !== 'TEACHER') {
      const authorized = await requirePermission(request, 'student:read')
      if (!authorized) return forbiddenError("You don't have permission to view student houses.")
    }

    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'
    const houses = await db.studentHouse.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        _count: {
          select: { students: { where: { deletedAt: null } } },
        },
      },
      orderBy: [{ name: 'asc' }],
    })

    return NextResponse.json({ houses })
  } catch (error) {
    console.error('List student houses error:', error)
    return internalError('loading student houses')
  }
}

// POST /api/school/student-houses - Create a reusable school house
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'student:update')
      if (!authorized) return forbiddenError("You don't have permission to manage student houses.")
    }

    const body = await request.json()
    const name = cleanName(body.name)
    if (!name) return apiError(400, 'House name is required.')

    const color = cleanColor(body.color)
    const description = cleanName(body.description) || null

    const existing = await db.studentHouse.findFirst({
      where: { schoolId: user.schoolId, name },
    })

    if (existing && !existing.deletedAt) {
      return apiError(409, 'A house with this name already exists.')
    }

    const house = existing
      ? await db.studentHouse.update({
          where: { id: existing.id },
          data: { color, description, isActive: true, deletedAt: null },
        })
      : await db.studentHouse.create({
          data: {
            schoolId: user.schoolId,
            name,
            color,
            description,
          },
        })

    return NextResponse.json(house, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError(409, 'A house with this name already exists.')
    }
    console.error('Create student house error:', error)
    return internalError('creating the student house')
  }
}
