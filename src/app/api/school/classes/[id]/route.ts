import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// PUT /api/school/classes/[id] - Update class (name, status, subjects)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'class:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to update classes.")
    }

    const { id } = await params
    const body = await request.json()
    const { name, isActive, subjectIds } = body

    // Verify class belongs to this school
    const classRecord = await db.class.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!classRecord) {
      return notFoundError('Class')
    }

    // If name is being changed, validate and check for duplicates
    if (name !== undefined) {
      if (!name || !name.trim()) {
        return apiError(400, 'Class name is required and cannot be empty.')
      }
      if (name.trim() !== classRecord.name) {
        const existing = await db.class.findFirst({
          where: {
            schoolId: user.schoolId,
            name: name.trim(),
            deletedAt: null,
            id: { not: id },
          },
        })
        if (existing) {
          return apiError(400, 'A class with this name already exists in your school. Please use a different name.')
        }
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (isActive !== undefined) updateData.isActive = isActive

    // Update class and handle subject assignments in a transaction
    const updated = await db.$transaction(async (tx) => {
      // Update basic class info
      const cls = await tx.class.update({
        where: { id },
        data: updateData,
        include: {
          sections: { where: { deletedAt: null }, orderBy: { name: 'asc' } },
        },
      })

      // If subjectIds is provided, replace all subject assignments
      if (subjectIds !== undefined) {
        // Validate subjectIds
        if (subjectIds && subjectIds.length > 0) {
          const validSubjects = await tx.subject.findMany({
            where: {
              id: { in: subjectIds },
              schoolId: user.schoolId,
              deletedAt: null,
            },
            select: { id: true },
          })
          const validIds = new Set(validSubjects.map(s => s.id))
          const invalidIds = subjectIds.filter((sid: string) => !validIds.has(sid))
          if (invalidIds.length > 0) {
            throw new Error('Some selected subjects are invalid or do not belong to your school.')
          }
        }

        // Delete existing subject assignments
        await tx.classSubject.deleteMany({
          where: { classId: id },
        })

        // Create new subject assignments
        if (subjectIds && subjectIds.length > 0) {
          await tx.classSubject.createMany({
            data: subjectIds.map((subjectId: string) => ({
              classId: id,
              subjectId,
            })),
          })
        }
      }

      return cls
    })

    // Fetch the updated class with subjects
    const result = await db.class.findUnique({
      where: { id },
      include: {
        sections: { where: { deletedAt: null }, orderBy: { name: 'asc' } },
        classSubjects: {
          include: {
            subject: {
              select: { id: true, name: true, code: true, type: true, sequenceNo: true, isActive: true },
            },
          },
          orderBy: { subject: { sequenceNo: 'asc' } },
        },
      },
    })

    // Flatten
    const { classSubjects, ...classData } = result!
    return NextResponse.json({
      class: {
        ...classData,
        subjects: classSubjects.map(cs => cs.subject),
      },
      message: 'Class has been updated successfully.',
    })
  } catch (error) {
    console.error('Update class error:', error)
    if (error instanceof Error && error.message.includes('invalid')) {
      return apiError(400, error.message)
    }
    return internalError('updating the class')
  }
}

// DELETE /api/school/classes/[id] - Soft delete class and its sections
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'class:delete')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to delete classes.")
    }

    const { id } = await params

    // Verify class belongs to this school
    const classRecord = await db.class.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: {
        _count: {
          select: { students: { where: { deletedAt: null } } },
        },
      },
    })
    if (!classRecord) {
      return notFoundError('Class')
    }

    // Check if class has active students
    if (classRecord._count.students > 0) {
      return apiError(
        400,
        'This class has students assigned to it. Please move or remove the students before deleting the class.'
      )
    }

    // Soft delete the class and all its sections in a transaction
    await db.$transaction(async (tx) => {
      await tx.classTeacherAssignment.deleteMany({
        where: {
          classId: id,
          schoolId: user.schoolId,
        },
      })

      // Soft delete all sections belonging to this class
      await tx.section.updateMany({
        where: {
          classId: id,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      })

      // Soft delete the class itself
      await tx.class.update({
        where: { id },
        data: { deletedAt: new Date() },
      })
    })

    return NextResponse.json({
      message: `Class "${classRecord.name || 'Unnamed'}" and its sections have been deleted successfully.`,
    })
  } catch (error) {
    console.error('Delete class error:', error)
    return internalError('deleting the class')
  }
}
