import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// DELETE /api/school/sections/[id] - Soft delete a section
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'class:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to manage sections.")
    }

    const { id } = await params

    // Verify section belongs to this school
    const section = await db.section.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: {
        _count: {
          select: { students: { where: { deletedAt: null } } },
        },
      },
    })
    if (!section) {
      return notFoundError('Section')
    }

    // Check if section has active students
    if (section._count.students > 0) {
      return apiError(
        400,
        `This section has ${section._count.students} student${section._count.students !== 1 ? 's' : ''} assigned. Please move or remove the students before deleting this section.`
      )
    }

    await db.$transaction(async (tx) => {
      await tx.classTeacherAssignment.deleteMany({
        where: {
          sectionId: id,
          schoolId: user.schoolId,
        },
      })

      // Soft delete the section
      await tx.section.update({
        where: { id },
        data: { deletedAt: new Date() },
      })
    })

    return NextResponse.json({
      message: `Section "${section.name}" has been deleted successfully.`,
    })
  } catch (error) {
    console.error('Delete section error:', error)
    return internalError('deleting the section')
  }
}
