import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

async function resolveAcademicYear(schoolId: string, value: string | null, requireActive = false) {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const academicYear = (value || school?.academicYear || '').trim()
  if (!ACADEMIC_YEAR_PATTERN.test(academicYear)) return null

  if (requireActive) {
    const exists = await db.academicYear.findFirst({
      where: { schoolId, name: academicYear, isActive: true, deletedAt: null },
      select: { id: true },
    })
    if (!exists) return null
  }

  return academicYear
}

// GET /api/school/timetable - Get timetable entries
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF', 'STUDENT'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId') || ''
    const sectionId = searchParams.get('sectionId') || ''
    const day = searchParams.get('day') || ''
    const teacherId = searchParams.get('teacherId') || ''
    const academicYear = await resolveAcademicYear(user.schoolId, searchParams.get('academicYear'))

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }
    if (academicYear) where.academicYear = academicYear
    if (classId) where.classId = classId
    if (sectionId) where.sectionId = sectionId
    if (day) where.day = day
    if (teacherId) where.teacherId = teacherId

    const timetable = await db.timetable.findMany({
      where,
      include: {
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        section: {
          select: { id: true, name: true, class: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ day: 'asc' }, { period: 'asc' }],
    })

    return NextResponse.json({ entries: timetable })
  } catch (error) {
    console.error('Get timetable error:', error)
    return internalError('loading the timetable')
  }
}

// POST /api/school/timetable - Create a single timetable entry with conflict detection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { classId, sectionId, subjectId, teacherId, day, period } = body

    // Cheap field check first so we don't run two permission queries for a request that's missing data anyway.
    if (!sectionId || !subjectId || !teacherId || !day || !period) {
      const fallbackUser = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
      if (!fallbackUser || !fallbackUser.schoolId) return unauthorizedError()
      return apiError(400, 'Please fill in all required fields: section, subject, teacher, day, and period.')
    }

    // Permission depends on whether this is a create or an update. Look up by the
    // unique key (school + year + section + day + period) to decide.
    const preUser = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF', 'TEACHER'])
    if (!preUser || !preUser.schoolId) return unauthorizedError()

    const academicYear = await resolveAcademicYear(preUser.schoolId, body.academicYear || null, true)
    if (!academicYear) {
      return apiError(400, 'Please choose an active academic year.')
    }

    const existing = await db.timetable.findFirst({
      where: {
        schoolId: preUser.schoolId,
        academicYear,
        sectionId,
        day,
        period: Number(period),
        deletedAt: null,
      },
      select: { id: true },
    })

    const requiredPermission = existing ? 'timetable:update' : 'timetable:create'
    const user = await requirePermission(request, requiredPermission)
    if (!user || !user.schoolId) {
      return apiError(403, `You don't have permission to ${existing ? 'update' : 'create'} timetable entries.`)
    }

    // Verify section belongs to this school
    const section = await db.section.findFirst({
      where: { id: sectionId, schoolId: user.schoolId, deletedAt: null },
      include: { class: true },
    })
    if (!section) {
      return apiError(400, "The selected section doesn't exist in your school.")
    }

    // Verify subject
    const subject = await db.subject.findFirst({
      where: { id: subjectId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!subject) {
      return apiError(400, "The selected subject doesn't exist in your school.")
    }

    // Verify subject is assigned to this class — prevents adding a subject to a
    // timetable that the class doesn't actually offer.
    const classSubject = await db.classSubject.findUnique({
      where: { classId_subjectId: { classId: section.classId, subjectId } },
    })
    if (!classSubject) {
      return apiError(
        400,
        `${subject.name} is not assigned to ${section.class.name || 'this class'}. Please assign it to the class first via Edit Class.`
      )
    }

    // Verify teacher
    const teacher = await db.teacher.findFirst({
      where: { id: teacherId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!teacher) {
      return apiError(400, "The selected teacher doesn't exist in your school.")
    }

    // Check teacher conflict — is this teacher already assigned at this day+period?
    const teacherConflict = await db.timetable.findFirst({
      where: {
        schoolId: user.schoolId,
        academicYear,
        teacherId,
        day,
        period: Number(period),
        deletedAt: null,
        sectionId: { not: sectionId },
      },
      include: {
        section: { select: { name: true, class: { select: { name: true } } } },
        subject: { select: { name: true } },
      },
    })

    if (teacherConflict) {
      return apiError(409, `Conflict: ${teacher.firstName} ${teacher.lastName} is already assigned to ${teacherConflict.subject?.name || 'a subject'} for ${teacherConflict.section?.class?.name || ''} - ${teacherConflict.section?.name || ''} on ${day} Period ${period}.`)
    }

    // Upsert the entry
    const entry = await db.timetable.upsert({
      where: {
        schoolId_academicYear_sectionId_day_period: {
          schoolId: user.schoolId,
          academicYear,
          sectionId,
          day,
          period: Number(period),
        },
      },
      create: {
        schoolId: user.schoolId,
        academicYear,
        classId: classId || section.classId,
        sectionId,
        subjectId,
        teacherId,
        day,
        period: Number(period),
      },
      update: {
        subjectId,
        teacherId,
        classId: classId || section.classId,
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        section: {
          select: { id: true, name: true, class: { select: { id: true, name: true } } },
        },
      },
    })

    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    console.error('Create timetable entry error:', error)
    return internalError('creating the timetable entry')
  }
}

// DELETE /api/school/timetable - Delete a timetable entry
export async function DELETE(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'timetable:delete')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to delete timetable entries.")
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const academicYear = await resolveAcademicYear(user.schoolId, searchParams.get('academicYear'))

    if (!id) {
      return apiError(400, 'Please provide the timetable entry ID to delete.')
    }

    const entry = await db.timetable.findFirst({
      where: { id, schoolId: user.schoolId, ...(academicYear ? { academicYear } : {}) },
    })

    if (!entry) {
      return apiError(404, "The timetable entry doesn't exist.")
    }

    await db.timetable.delete({ where: { id } })

    return NextResponse.json({ message: 'Timetable entry deleted successfully' })
  } catch (error) {
    console.error('Delete timetable entry error:', error)
    return internalError('deleting the timetable entry')
  }
}
