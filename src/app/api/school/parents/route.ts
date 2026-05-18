import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/parents - List parents
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }

    if (search) {
      where.OR = [
        { fatherName: { contains: search } },
        { motherName: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ]
    }

    const [parents, total] = await Promise.all([
      db.parent.findMany({
        where,
        include: {
          children: {
            include: {
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  rollNumber: true,
                  class: { select: { name: true } },
                  section: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.parent.count({ where }),
    ])

    return NextResponse.json({
      parents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List parents error:', error)
    return internalError('loading parents')
  }
}
