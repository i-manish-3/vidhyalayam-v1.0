import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

const VALID_TYPES = ['primary', 'optional', 'extra', 'special']

// PUT /api/school/subjects/[id] - Update subject
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'subject:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to update subjects.")
    }

    const { id } = await params
    const body = await request.json()
    const { name, code, sequenceNo, type, isActive, classIds } = body

    // Verify subject belongs to this school
    const subject = await db.subject.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!subject) {
      return notFoundError('Subject')
    }

    // If code is being changed, check for duplicates in the same school (code must be unique, name can be duplicated)
    if (code !== undefined && code.trim() && code.trim() !== subject.code) {
      const existingCode = await db.subject.findFirst({
        where: {
          schoolId: user.schoolId,
          code: code.trim(),
          deletedAt: null,
          id: { not: id },
        },
      })
      if (existingCode) {
        return apiError(400, `A subject with code "${code.trim()}" already exists. Please use a different code.`)
      }
    }

    // Validate type if provided
    if (type !== undefined && !VALID_TYPES.includes(type)) {
      return apiError(400, 'Subject type must be Primary, Optional, Extra, or Special. Please choose a valid type.')
    }

    // Build update data
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (code !== undefined) updateData.code = code || null
    if (sequenceNo !== undefined) updateData.sequenceNo = sequenceNo != null ? sequenceNo : null
    if (type !== undefined) updateData.type = type
    if (isActive !== undefined) updateData.isActive = isActive

    // Update class associations if classIds is provided
    if (classIds !== undefined) {
      // Delete existing associations
      await db.classSubject.deleteMany({ where: { subjectId: id } })
      // Create new associations
      if (Array.isArray(classIds) && classIds.length > 0) {
        await db.classSubject.createMany({
          data: classIds.map((cId: string) => ({
            classId: cId,
            subjectId: id,
          })),
        })
      }
    }

    const updated = await db.subject.update({
      where: { id },
      data: updateData,
      include: {
        classSubjects: {
          include: { class: { select: { id: true, name: true } } },
        },
      },
    })

    const { classSubjects, ...subjectData } = updated
    return NextResponse.json({
      subject: {
        ...subjectData,
        classes: classSubjects.map(cs => cs.class),
      },
      message: 'Subject has been updated successfully.',
    })
  } catch (error) {
    console.error('Update subject error:', error)
    return internalError('updating the subject')
  }
}

// DELETE /api/school/subjects/[id] - Soft delete subject
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'subject:delete')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to delete subjects.")
    }

    const { id } = await params

    // Verify subject belongs to this school
    const subject = await db.subject.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!subject) {
      return notFoundError('Subject')
    }

    // Soft delete — set deletedAt to now, do NOT hard delete
    await db.subject.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({
      message: `Subject "${subject.name}" has been deleted successfully.`,
    })
  } catch (error) {
    console.error('Delete subject error:', error)
    return internalError('deleting the subject')
  }
}
