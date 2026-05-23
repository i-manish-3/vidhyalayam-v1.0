import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, internalError, apiError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

// GET /api/school/transport/allocations/route-counts?academicYears=2025-2026,2026-2027&routeIds=id1,id2
// Returns active transport-allocation counts for the given routes in the given
// academic years. Used by the Annual Transport Setup preview to surface
// how many students each route currently carries.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()
    const authorized = await requirePermission(request, 'transport:annual-setup')
    if (!authorized) return forbiddenError()

    const { searchParams } = new URL(request.url)
    const academicYears = (searchParams.get('academicYears') || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => ACADEMIC_YEAR_PATTERN.test(s))
    const routeIds = (searchParams.get('routeIds') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (academicYears.length === 0) {
      return apiError(400, 'Please provide one or more valid academic years.')
    }
    if (routeIds.length === 0) {
      return NextResponse.json({ counts: [] })
    }

    const grouped = await db.transportAllocation.groupBy({
      by: ['routeId', 'academicYear'],
      where: {
        schoolId: user.schoolId,
        routeId: { in: routeIds },
        academicYear: { in: academicYears },
        isActive: true,
      },
      _count: { _all: true },
    })

    const counts = grouped.map((row) => ({
      routeId: row.routeId,
      academicYear: row.academicYear,
      count: row._count._all,
    }))

    return NextResponse.json({ counts })
  } catch (error) {
    console.error('Transport route-counts error:', error)
    return internalError('loading transport allocation counts')
  }
}
