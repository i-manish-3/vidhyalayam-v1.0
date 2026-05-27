import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, internalError, notFoundError, unauthorizedError } from '@/lib/api-errors'

function parseDate(value: unknown) {
  if (value === undefined) return undefined
  if (!value) return null
  if (typeof value !== 'string') return null

  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

async function getSwitchPreview(schoolId: string, targetYear: string) {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const currentYear = school?.academicYear || null

  const [
    activeStudents,
    admissions,
    feeStructures,
    feeAssignments,
    feeInvoices,
    attendance,
    timetable,
    exams,
    transportRoutes,
    transportAllocations,
  ] = await Promise.all([
    db.student.count({ where: { schoolId, isActive: true, deletedAt: null } }),
    db.admission.count({ where: { schoolId, academicYear: targetYear, deletedAt: null } }),
    db.feesStructure.count({ where: { schoolId, academicYear: targetYear, deletedAt: null } }),
    db.studentFeeAssignment.count({ where: { schoolId, academicYear: targetYear, deletedAt: null } }),
    db.studentFeeInvoice.count({ where: { schoolId, assignment: { academicYear: targetYear }, deletedAt: null } }),
    db.attendance.count({ where: { schoolId, academicYear: targetYear } }),
    db.timetable.count({ where: { schoolId, academicYear: targetYear, deletedAt: null } }),
    db.exam.count({ where: { schoolId, academicYear: targetYear, deletedAt: null } }),
    db.transportRoute.count({ where: { schoolId, academicYear: targetYear, deletedAt: null } }),
    db.transportAllocation.count({ where: { schoolId, academicYear: targetYear, isActive: true } }),
  ])

  return {
    currentYear,
    targetYear,
    counts: {
      activeStudents,
      admissions,
      feeStructures,
      feeAssignments,
      feeInvoices,
      attendance,
      timetable,
      exams,
      transportRoutes,
      transportAllocations,
    },
    warnings: [
      feeStructures === 0 ? 'No fee structures exist for the target year.' : null,
      activeStudents > 0 && feeAssignments === 0 ? 'No student fee assignments exist for the target year.' : null,
      timetable === 0 ? 'No timetable entries exist for the target year.' : null,
      transportRoutes === 0 ? 'No transport routes exist for the target year.' : null,
    ].filter(Boolean),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params
    const includeDeleted = request.nextUrl.searchParams.get('includeDeleted') === 'true'
    const existing = await db.academicYear.findFirst({
      where: { id, schoolId: user.schoolId, ...(includeDeleted ? {} : { deletedAt: null }) },
    })
    if (!existing) {
      return notFoundError('AcademicYear')
    }

    const preview = await getSwitchPreview(user.schoolId, existing.name)
    return NextResponse.json({ year: existing, preview })
  } catch (error) {
    console.error('Academic year switch preview error:', error)
    return internalError('loading academic year switch preview')
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'settings:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to update academic years.")
    }

    const { id } = await params
    const body = await request.json()
    const startDate = parseDate(body.startDate)
    const endDate = parseDate(body.endDate)

    if (startDate === null && body.startDate) {
      return apiError(400, 'Please choose a valid start date.')
    }
    if (endDate === null && body.endDate) {
      return apiError(400, 'Please choose a valid end date.')
    }
    if (startDate instanceof Date && endDate instanceof Date && startDate > endDate) {
      return apiError(400, 'Start date must be before end date.')
    }

    const isRestore = body.restoreAcademicYear === true
    const existing = await db.academicYear.findFirst({
      where: { id, schoolId: user.schoolId, ...(isRestore ? {} : { deletedAt: null }) },
    })
    if (!existing) {
      return notFoundError('AcademicYear')
    }
    if (isRestore) {
      const confirmed =
        body.confirmAcademicYearRestore === true &&
        body.acknowledgedImpact === true &&
        body.confirmationText === existing.name

      if (!confirmed) {
        return apiError(409, `Type ${existing.name} and confirm the academic-year impact before restoring it.`)
      }

      const year = await db.academicYear.update({
        where: { id },
        data: {
          deletedAt: null,
          isActive: true,
          isCurrent: false,
        },
      })

      return NextResponse.json({ year })
    }
    if (existing.isCurrent && body.isActive === false) {
      return apiError(400, 'Current academic year cannot be inactive. Set another year as current first.')
    }

    const isCurrent = body.isCurrent === true
    if (isCurrent && !existing.isCurrent) {
      const confirmed =
        body.confirmAcademicYearSwitch === true &&
        body.acknowledgedImpact === true &&
        body.confirmationText === existing.name

      if (!confirmed) {
        return apiError(409, `Type ${existing.name} and confirm the academic-year impact before switching current year.`)
      }
    }

    const updateData: Record<string, unknown> = {}

    if (startDate !== undefined) updateData.startDate = startDate
    if (endDate !== undefined) updateData.endDate = endDate
    if (typeof body.isActive === 'boolean') updateData.isActive = body.isActive
    if (isCurrent) {
      updateData.isCurrent = true
      updateData.isActive = true
    }

    const year = await db.$transaction(async (tx) => {
      if (isCurrent) {
        await tx.academicYear.updateMany({
          where: { schoolId: user.schoolId!, deletedAt: null },
          data: { isCurrent: false },
        })
      }

      const updated = await tx.academicYear.update({
        where: { id },
        data: updateData,
      })

      if (isCurrent) {
        await tx.school.update({
          where: { id: user.schoolId! },
          data: { academicYear: updated.name },
        })
        await tx.admissionSetting.updateMany({
          where: { schoolId: user.schoolId! },
          data: { academicYear: updated.name },
        })
      }

      return updated
    })

    return NextResponse.json({ year })
  } catch (error) {
    console.error('Update academic year error:', error)
    return internalError('updating academic year')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'settings:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to delete academic years.")
    }

    const { id } = await params
    const existing = await db.academicYear.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) {
      return notFoundError('AcademicYear')
    }
    if (existing.isCurrent) {
      return apiError(400, 'Current academic year cannot be deleted. Set another year as current first.')
    }

    const body = await request.json().catch(() => ({}))
    const confirmed =
      body.confirmAcademicYearDelete === true &&
      body.acknowledgedImpact === true &&
      body.confirmationText === existing.name

    if (!confirmed) {
      return apiError(409, `Type ${existing.name} and confirm the academic-year impact before deleting it.`)
    }

    await db.academicYear.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        isCurrent: false,
      },
    })

    return NextResponse.json({ message: 'Academic year deleted.' })
  } catch (error) {
    console.error('Delete academic year error:', error)
    return internalError('deleting academic year')
  }
}
