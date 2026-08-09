import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, forbiddenError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

async function resolveAcademicYear(schoolId: string, value: string | null) {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const academicYear = (value || school?.academicYear || '').trim()
  return ACADEMIC_YEAR_PATTERN.test(academicYear) ? academicYear : null
}

// GET /api/school/students/stats - Lightweight aggregate counts for the
// students list page. Avoids downloading student rows just to tally them.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SUPER_ADMIN' && user.role !== 'TEACHER') {
      const authorized = await requirePermission(request, 'student:read')
      if (!authorized) return forbiddenError("You don't have permission to view students.")
    }

    const { searchParams } = new URL(request.url)
    const academicYear = await resolveAcademicYear(user.schoolId, searchParams.get('academicYear'))

    const filters: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }
    if (academicYear) {
      filters.OR = [
        { academicEnrollments: { some: { academicYear, deletedAt: null } } },
        { admission: { academicYear } },
      ]
    }

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    const [byStatus, admittedThisMonth] = await Promise.all([
      db.student.groupBy({
        by: ['isActive'],
        where: filters,
        _count: { _all: true },
      }),
      db.student.count({
        where: {
          ...filters,
          admissionDate: { gte: monthStart, lte: monthEnd },
        },
      }),
    ])

    const active = byStatus.find((g) => g.isActive)?._count._all || 0
    const inactive = byStatus.find((g) => !g.isActive)?._count._all || 0

    return NextResponse.json({
      total: active + inactive,
      active,
      inactive,
      admittedThisMonth,
    })
  } catch (error) {
    console.error('Student stats error:', error)
    return internalError('loading student statistics')
  }
}