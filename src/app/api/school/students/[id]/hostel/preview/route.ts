/**
 * POST /api/school/students/[id]/hostel/preview
 *
 * Dry-run for adding hostel mid-year. Returns the billable-months list, total
 * fare, and any guardrail violations (active allocation overlap, bed occupied,
 * missing fare configuration). The UI calls this when the admin picks a
 * bed + effectiveFrom to render the impact panel before committing.
 *
 * Body: same as hostel POST.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { currentAcademicYear, parseDate, parseFeeMonths, proRateMonths, resolveRoomFare } from '@/lib/hostel-billing'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'hostel:allocation:update')
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: studentId } = await params
    const body = await request.json().catch(() => ({}))

    const bedId = typeof body.bedId === 'string' && body.bedId.trim() ? body.bedId.trim() : null
    if (!bedId) return apiError(400, 'bedId is required')

    const today = new Date()
    const effectiveFrom = parseDate(body.effectiveFrom) || today
    const academicYear = currentAcademicYear(today)

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found')

    const bed = await db.hostelBed.findFirst({
      where: { id: bedId, schoolId: user.schoolId, deletedAt: null, isActive: true },
      select: { id: true, roomId: true, bedNumber: true },
    })
    if (!bed) return apiError(404, 'Bed not found')

    const activeAlloc = await db.hostelAllocation.findFirst({
      where: { schoolId: user.schoolId, studentId, academicYear, isActive: true },
      select: { id: true },
    })
    const bedOccupied = await db.hostelAllocation.findFirst({
      where: { schoolId: user.schoolId, bedId, academicYear, isActive: true },
      select: { id: true },
    })

    const fareInfo = await resolveRoomFare(user.schoolId, bed.roomId, academicYear)
    if (!fareInfo) {
      return NextResponse.json({
        success: true,
        canCommit: false,
        blockers: ['No fare configured for this room in the current academic year'],
        billableMonths: [],
        fare: 0,
        totalAmount: 0,
        academicYear,
      })
    }

    const allMonths = parseFeeMonths(fareInfo.feeMonths)
    const billableMonths = proRateMonths(allMonths, academicYear, effectiveFrom)

    const blockers: string[] = []
    if (activeAlloc) {
      blockers.push('Student already has an active hostel allocation. Withdraw it before adding a new one.')
    }
    if (bedOccupied) {
      blockers.push('That bed is already occupied for this academic year. Choose a different bed.')
    }
    if (allMonths.length === 0) blockers.push('Room has no fee months configured')
    if (billableMonths.length === 0 && allMonths.length > 0) {
      blockers.push('Effective-from date is past every billing month — nothing to bill')
    }

    return NextResponse.json({
      success: true,
      canCommit: blockers.length === 0,
      blockers,
      billableMonths,
      droppedMonths: allMonths.filter((m) => !billableMonths.includes(m)),
      fare: fareInfo.fare,
      totalAmount: fareInfo.fare * billableMonths.length,
      academicYear,
      effectiveFrom: effectiveFrom.toISOString(),
    })
  } catch (error) {
    console.error('POST /students/[id]/hostel/preview failed:', error)
    return internalError('Failed to preview hostel addition')
  }
}
