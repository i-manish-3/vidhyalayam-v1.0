import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { apiError, internalError, notFoundError, unauthorizedError } from '@/lib/api-errors'

function parseDate(value: unknown) {
  if (value === undefined) return undefined
  if (!value) return null
  if (typeof value !== 'string') return null

  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
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

    const existing = await db.academicYear.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) {
      return notFoundError('AcademicYear')
    }
    if (existing.isCurrent && body.isActive === false) {
      return apiError(400, 'Current academic year cannot be inactive. Set another year as current first.')
    }

    const isCurrent = body.isCurrent === true
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
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
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
