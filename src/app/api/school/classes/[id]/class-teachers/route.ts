import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'
import { validateAcademicYear } from '@/lib/validators'

interface AssignmentInput {
  sectionId?: string
  teacherId?: string | null
}

function formatClassTeacherConflict(conflict: {
  class: { name: string | null }
  section: { name: string } | null
  teacher: { firstName: string; lastName: string }
}, academicYear: string) {
  const teacherName = `${conflict.teacher.firstName} ${conflict.teacher.lastName}`.trim()
  const target = conflict.section?.name
    ? `${conflict.class.name || 'another class'}-${conflict.section.name}`
    : conflict.class.name || 'another class'
  return `${teacherName} is already class teacher for ${target} in ${academicYear}.`
}

// PUT /api/school/classes/[id]/class-teachers
// Replaces class teacher assignments for this class in one academic year.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'class:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to assign class teachers.")
    }

    const { id } = await params
    const body = await request.json()
    const academicYear = typeof body.academicYear === 'string' ? body.academicYear.trim() : ''
    const academicYearError = validateAcademicYear(academicYear, true)
    if (academicYearError) return apiError(400, academicYearError)

    const assignments = Array.isArray(body.assignments) ? body.assignments as AssignmentInput[] : null
    const classTeacherId = typeof body.classTeacherId === 'string' ? body.classTeacherId.trim() : ''
    if (!assignments) {
      return apiError(400, 'Assignments must be provided.')
    }

    const classRecord = await db.class.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: {
        sections: {
          where: { deletedAt: null },
          select: { id: true, name: true },
        },
      },
    })
    if (!classRecord) {
      return notFoundError('Class')
    }

    const sectionIds = new Set(classRecord.sections.map((section) => section.id))
    const normalized = assignments
      .filter((assignment) => assignment.sectionId)
      .map((assignment) => ({
        sectionId: assignment.sectionId as string,
        teacherId: assignment.teacherId?.trim() || null,
      }))
    const useClassLevelAssignment = classRecord.sections.length === 0 && !!classTeacherId

    const invalidSection = normalized.find((assignment) => !sectionIds.has(assignment.sectionId))
    if (invalidSection) {
      return apiError(400, 'One or more sections do not belong to this class.')
    }

    const teacherIds = normalized
      .map((assignment) => assignment.teacherId)
      .filter(Boolean) as string[]
    if (useClassLevelAssignment) teacherIds.push(classTeacherId)
    const uniqueTeacherIds = Array.from(new Set(teacherIds))

    if (uniqueTeacherIds.length > 0) {
      const teachers = await db.teacher.findMany({
        where: {
          id: { in: uniqueTeacherIds },
          schoolId: user.schoolId,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      })
      const validTeacherIds = new Set(teachers.map((teacher) => teacher.id))
      const invalidTeacher = uniqueTeacherIds.find((teacherId) => !validTeacherIds.has(teacherId))
      if (invalidTeacher) {
        return apiError(400, 'One or more selected teachers are inactive or do not belong to this school.')
      }

      const conflicts = await db.classTeacherAssignment.findMany({
        where: {
          schoolId: user.schoolId,
          academicYear,
          teacherId: { in: uniqueTeacherIds },
          classId: { not: id },
          deletedAt: null,
        },
        include: {
          class: { select: { name: true } },
          section: { select: { name: true } },
          teacher: { select: { firstName: true, lastName: true } },
        },
      })
      if (conflicts.length > 0) {
        return apiError(400, formatClassTeacherConflict(conflicts[0], academicYear))
      }
    }

    await db.$transaction(async (tx) => {
      await tx.classTeacherAssignment.deleteMany({
        where: {
          schoolId: user.schoolId,
          academicYear,
          classId: id,
        },
      })

      const rows = normalized.filter((assignment) => assignment.teacherId)
      if (rows.length > 0) {
        await tx.classTeacherAssignment.createMany({
          data: rows.map((assignment) => ({
            schoolId: user.schoolId!,
            academicYear,
            classId: id,
            sectionId: assignment.sectionId,
            teacherId: assignment.teacherId as string,
          })),
        })
      }

      if (useClassLevelAssignment) {
        await tx.classTeacherAssignment.create({
          data: {
            schoolId: user.schoolId!,
            academicYear,
            classId: id,
            sectionId: null,
            teacherId: classTeacherId,
          },
        })
      }
    })

    const saved = await db.classTeacherAssignment.findMany({
      where: {
        schoolId: user.schoolId,
        academicYear,
        classId: id,
        deletedAt: null,
      },
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            profileImage: true,
            isActive: true,
          },
        },
      },
      orderBy: { section: { name: 'asc' } },
    })

    return NextResponse.json({
      assignments: saved,
      message: 'Class teacher assignments have been updated.',
    })
  } catch (error) {
    console.error('Update class teacher assignments error:', error)
    return internalError('updating class teacher assignments')
  }
}
