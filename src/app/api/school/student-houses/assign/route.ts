import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'

// POST /api/school/student-houses/assign
// Body: { houseId: string | null, studentIds: string[] }
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'student:update')
      if (!authorized) return forbiddenError("You don't have permission to assign student houses.")
    }

    const body = await request.json()
    const rawStudentIds: string[] = Array.isArray(body.studentIds)
      ? body.studentIds.filter((id: unknown): id is string => typeof id === 'string' && !!id.trim())
      : []
    const studentIds = Array.from(new Set(rawStudentIds))
    const houseId = typeof body.houseId === 'string' && body.houseId.trim() ? body.houseId.trim() : null

    if (studentIds.length === 0) {
      return apiError(400, 'Please select at least one student.')
    }

    if (houseId) {
      const house = await db.studentHouse.findFirst({
        where: { id: houseId, schoolId: user.schoolId, deletedAt: null, isActive: true },
        select: { id: true },
      })
      if (!house) return apiError(404, 'Selected house not found.')
    }

    const matchingStudents = await db.student.findMany({
      where: {
        id: { in: studentIds },
        schoolId: user.schoolId,
        deletedAt: null,
      },
      select: { id: true },
    })
    if (matchingStudents.length === 0) {
      return apiError(404, 'No matching students found.')
    }

    const ids = matchingStudents.map((student) => student.id)
    await db.student.updateMany({
      where: { id: { in: ids }, schoolId: user.schoolId },
      data: { houseId },
    })

    return NextResponse.json({
      message: houseId ? 'House assigned successfully.' : 'House assignment removed.',
      updatedCount: ids.length,
    })
  } catch (error) {
    console.error('Assign student house error:', error)
    return internalError('assigning student houses')
  }
}
