import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, internalError, apiError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

// GET /api/school/hostels/allocations/room-counts?academicYears=2025-2026,2026-2027&hostelIds=id1,id2
// Returns active hostel-allocation (occupancy) counts for the given hostels in
// the given academic years. Used by the Annual Hostel Setup preview to surface
// how many students each hostel currently houses.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()
    const authorized = await requirePermission(request, 'hostel:annual-setup')
    if (!authorized) return forbiddenError()

    const { searchParams } = new URL(request.url)
    const academicYears = (searchParams.get('academicYears') || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => ACADEMIC_YEAR_PATTERN.test(s))
    const hostelIds = (searchParams.get('hostelIds') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (academicYears.length === 0) {
      return apiError(400, 'Please provide one or more valid academic years.')
    }
    if (hostelIds.length === 0) {
      return NextResponse.json({ counts: [] })
    }

    const grouped = await db.hostelAllocation.groupBy({
      by: ['hostelId', 'academicYear'],
      where: {
        schoolId: user.schoolId,
        hostelId: { in: hostelIds },
        academicYear: { in: academicYears },
        isActive: true,
      },
      _count: { _all: true },
    })

    const counts = grouped.map((row) => ({
      hostelId: row.hostelId,
      academicYear: row.academicYear,
      count: row._count._all,
    }))

    return NextResponse.json({ counts })
  } catch (error) {
    console.error('Hostel room-counts error:', error)
    return internalError('loading hostel allocation counts')
  }
}
