import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/salary/advance - List advance requests
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'salary:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view salary advances.")
    }

    const { searchParams } = new URL(request.url)
    const teacherId = searchParams.get('teacherId') || ''
    const approvalStatus = searchParams.get('approvalStatus') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
    }
    if (teacherId) where.teacherId = teacherId
    if (approvalStatus) where.approvalStatus = approvalStatus

    const [requests, total] = await Promise.all([
      db.advanceRequest.findMany({
        where,
        include: {
          teacher: {
            select: { id: true, firstName: true, lastName: true, employeeId: true },
          },
        },
        orderBy: { requestDate: 'desc' },
        skip,
        take: limit,
      }),
      db.advanceRequest.count({ where }),
    ])

    return NextResponse.json({
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List advance requests error:', error)
    return internalError('listing advance requests')
  }
}

// POST /api/school/salary/advance - Create advance request
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'salary:advance')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to request salary advances.")
    }

    const body = await request.json()
    const {
      teacherId,
      amount,
      reason,
      requestDate,
      deductionMonth,
      deductionYear,
    } = body

    if (!teacherId || !amount) {
      return apiError(400, 'Please select a teacher and enter the advance amount.')
    }

    // Verify teacher belongs to this school
    const teacher = await db.teacher.findFirst({
      where: { id: teacherId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!teacher) {
      return notFoundError('Teacher')
    }

    const advanceRequest = await db.advanceRequest.create({
      data: {
        schoolId: user.schoolId,
        teacherId,
        amount,
        reason,
        requestDate: requestDate ? new Date(requestDate) : new Date(),
        deductionMonth,
        deductionYear,
      },
    })

    return NextResponse.json(advanceRequest, { status: 201 })
  } catch (error) {
    console.error('Create advance request error:', error)
    return internalError('creating the advance request')
  }
}
