/**
 * GET /api/school/students/[id]/transport/history
 *
 * Returns the full TransportEvent timeline for a student in the current
 * (or specified) academic year, plus the chained TransportAllocation
 * lineage. Used by the profile page to render a "transport history"
 * panel.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

function currentAcademicYear(today: Date): string {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth() + 1
  return m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireRole(request, [
      'SUPER_ADMIN',
      'SCHOOL_ADMIN',
      'TEACHER',
      'PARENT',
      'STAFF',
    ])
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: studentId } = await params
    const url = new URL(request.url)
    const academicYear = url.searchParams.get('academicYear') || currentAcademicYear(new Date())

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found')

    const [events, allocations] = await Promise.all([
      db.transportEvent.findMany({
        where: { schoolId: user.schoolId, studentId, academicYear },
        orderBy: { createdAt: 'asc' },
      }),
      db.transportAllocation.findMany({
        where: { schoolId: user.schoolId, studentId, academicYear },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          routeId: true,
          stopName: true,
          fareAmount: true,
          feeMonths: true,
          isActive: true,
          effectiveFrom: true,
          effectiveTo: true,
          changeReason: true,
          previousAllocationId: true,
          withdrawalNotes: true,
          cascadeFromWithdrawal: true,
          createdAt: true,
          route: { select: { routeName: true, routeNumber: true, vehicleNumber: true } },
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      academicYear,
      events,
      allocations,
    })
  } catch (error) {
    console.error('GET /students/[id]/transport/history failed:', error)
    return internalError('Failed to fetch transport history')
  }
}
