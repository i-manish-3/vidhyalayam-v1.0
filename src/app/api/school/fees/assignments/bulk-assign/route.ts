import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, forbiddenError, internalError, unauthorizedError } from '@/lib/api-errors'
import { assignStudentFeesFromStructure } from '@/lib/fees'

const MAX_STUDENTS_PER_REQUEST = 100

type AssignResult = {
  assigned: Array<{ studentId: string }>
  skipped: Array<{ studentId: string; reason: string }>
  failed: Array<{ studentId: string; reason: string }>
}

// POST /api/school/fees/assignments/bulk-assign
// Freshly assigns a fee group to students who don't yet have an active fee
// assignment for the year (typically bulk-imported students). Each student is
// processed in its own transaction so one bad row never aborts the batch.
export async function POST(request: NextRequest) {
  try {
    // SUPER_ADMIN is intentionally excluded — same restriction as change-group.
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SCHOOL_ADMIN') {
      const authorized = await requirePermission(request, 'fees:change-group')
      if (!authorized) {
        return forbiddenError("You don't have permission to assign fee groups. Contact your school administrator.")
      }
    }

    const schoolId = user.schoolId
    const body = await request.json().catch(() => ({}))
    const academicYear = typeof body.academicYear === 'string' ? body.academicYear.trim() : ''
    const classId = typeof body.classId === 'string' ? body.classId.trim() : ''
    const feesGroupId = typeof body.feesGroupId === 'string' ? body.feesGroupId.trim() : ''
    const chargeFullYear = body.chargeFullYear === true
    const studentIds: string[] = Array.isArray(body.studentIds)
      ? Array.from(new Set(body.studentIds.filter((id: unknown): id is string => typeof id === 'string' && !!id.trim())))
      : []

    if (!academicYear) return apiError(400, 'Please select an academic year.')
    if (!classId) return apiError(400, 'Please select a class.')
    if (!feesGroupId) return apiError(400, 'Please select a fee group.')
    if (studentIds.length === 0) return apiError(400, 'Please select at least one student.')
    if (studentIds.length > MAX_STUDENTS_PER_REQUEST) {
      return apiError(400, `Please assign at most ${MAX_STUDENTS_PER_REQUEST} students per batch.`)
    }

    // Validate target fee group belongs to the school and is active.
    const targetGroup = await db.feesGroup.findFirst({
      where: { id: feesGroupId, schoolId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
    })
    if (!targetGroup) {
      return apiError(400, "The selected fee group doesn't exist or is inactive. Please refresh and try again.")
    }

    // Validate at least one active fee structure exists for this class + group + year.
    const structureExists = await db.feesStructure.findFirst({
      where: {
        schoolId,
        classId,
        feesGroupId,
        academicYear,
        isActive: true,
        status: 'active',
        deletedAt: null,
      },
      select: { id: true },
    })
    if (!structureExists) {
      return apiError(
        400,
        `No active fee structure exists for "${targetGroup.name}" in ${academicYear} for this class. Please create one before assigning.`,
      )
    }

    // Pull the year's enrollment for the selected students so we can verify class
    // membership and read each student's section + admission date.
    const enrollments = await db.studentAcademicEnrollment.findMany({
      where: {
        schoolId,
        academicYear,
        classId,
        status: 'active',
        deletedAt: null,
        studentId: { in: studentIds },
        student: { deletedAt: null, isActive: true },
      },
      select: {
        studentId: true,
        sectionId: true,
        student: { select: { admissionDate: true } },
      },
    })
    const enrollmentByStudent = new Map(enrollments.map((row) => [row.studentId, row]))

    const result: AssignResult = { assigned: [], skipped: [], failed: [] }

    for (const studentId of studentIds) {
      const enrollment = enrollmentByStudent.get(studentId)
      if (!enrollment) {
        result.failed.push({ studentId, reason: 'Not enrolled in this class for the selected year.' })
        continue
      }

      try {
        // Concurrency-safe skip: don't double-assign if a demand appeared since
        // the page was loaded.
        const alreadyAssigned = await db.studentFeeAssignment.findFirst({
          where: { schoolId, studentId, academicYear, status: 'active', deletedAt: null },
          select: { id: true },
        })
        if (alreadyAssigned) {
          result.skipped.push({ studentId, reason: 'Already has an active fee assignment for this year.' })
          continue
        }

        const effectiveFrom = enrollment.student?.admissionDate || new Date()

        await db.$transaction(async (tx) => {
          const assignment = await assignStudentFeesFromStructure({
            tx,
            schoolId,
            studentId,
            classId,
            sectionId: enrollment.sectionId,
            feesGroupId,
            academicYear,
            assignedBy: user.userId,
            source: 'bulk-assign',
            effectiveFrom,
            chargeFullYear,
          })
          if (!assignment) {
            throw new Error('FEE_STRUCTURE_NOT_FOUND')
          }
        })

        result.assigned.push({ studentId })
      } catch (err) {
        if (err instanceof Error && err.message === 'FEE_STRUCTURE_NOT_FOUND') {
          result.failed.push({
            studentId,
            reason: 'No matching fee structure for this student’s class/section.',
          })
        } else {
          result.failed.push({ studentId, reason: err instanceof Error ? err.message.slice(0, 200) : 'Unknown error' })
        }
      }
    }

    const message =
      `Assigned ${result.assigned.length} student${result.assigned.length === 1 ? '' : 's'} to "${targetGroup.name}".` +
      (result.skipped.length ? ` ${result.skipped.length} skipped.` : '') +
      (result.failed.length ? ` ${result.failed.length} failed.` : '')

    return NextResponse.json({ ...result, message })
  } catch (error) {
    console.error('Bulk assign fee group error:', error)
    return internalError('assigning fee groups')
  }
}
