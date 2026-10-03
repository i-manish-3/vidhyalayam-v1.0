import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { sortClassesByNaturalOrder } from '@/lib/class-order'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

async function resolveAcademicYear(schoolId: string, value: string | null) {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const academicYear = (value || school?.academicYear || '').trim()
  if (!ACADEMIC_YEAR_PATTERN.test(academicYear)) return null
  return academicYear
}

// GET /api/school/teacher/homework-classes
// Returns classes, sections, and subjects available for giving homework.
// Teachers get only their assigned classes & subjects.
// Admins get all classes & subjects, plus a list of teachers to assign on behalf of.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const academicYear = await resolveAcademicYear(
      user.schoolId,
      request.nextUrl.searchParams.get('academicYear')
    )
    if (!academicYear) {
      return apiError(400, 'Academic year is invalid or not configured.')
    }

    const isAdmin = user.role === 'SCHOOL_ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'STAFF'

    if (isAdmin) {
      // Admins see all classes, sections, subjects, and teachers
      const [allClasses, teachers] = await Promise.all([
        db.class.findMany({
          where: { schoolId: user.schoolId, deletedAt: null, isActive: true },
          include: {
            sections: {
              where: { deletedAt: null, isActive: true },
              orderBy: { name: 'asc' },
              select: { id: true, name: true, teacherId: true },
            },
            classSubjects: {
              include: {
                subject: {
                  select: { id: true, name: true, code: true, type: true, isActive: true },
                },
              },
              orderBy: { subject: { sequenceNo: 'asc' } },
            },
          },
          orderBy: { name: 'asc' },
        }),
        db.teacher.findMany({
          where: { schoolId: user.schoolId, deletedAt: null, isActive: true },
          select: { id: true, firstName: true, lastName: true, employeeId: true },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        }),
      ])

      const sortedClasses = sortClassesByNaturalOrder(allClasses)

      const formattedClasses = sortedClasses.map((cls) => ({
        id: cls.id,
        name: cls.name,
        sections: cls.sections.map((sec) => ({
          id: sec.id,
          name: sec.name,
          teacherId: sec.teacherId,
        })),
        subjects: cls.classSubjects
          .filter((cs) => cs.subject && cs.subject.isActive)
          .map((cs) => ({
            id: cs.subject.id,
            name: cs.subject.name,
            code: cs.subject.code,
            type: cs.subject.type,
          })),
      }))

      return NextResponse.json({
        isAdmin: true,
        teacher: null,
        teachers: teachers.map((t) => ({
          id: t.id,
          name: `${t.firstName} ${t.lastName}`.trim(),
          employeeId: t.employeeId,
        })),
        classes: formattedClasses,
        academicYear,
      })
    }

    // Role is TEACHER
    let teacher = await db.teacher.findFirst({
      where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, employeeId: true },
    })

    if (!teacher) {
      // Fallback if userId wasn't directly linked: check by employeeId, name, or active teacher
      const u = await db.user.findUnique({
        where: { id: user.userId },
        select: { employeeId: true, name: true, email: true },
      })
      if (u?.employeeId) {
        teacher = await db.teacher.findFirst({
          where: { schoolId: user.schoolId, employeeId: u.employeeId, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        })
      }
      if (!teacher && u?.name) {
        const parts = u.name.trim().split(/\s+/)
        teacher = await db.teacher.findFirst({
          where: {
            schoolId: user.schoolId,
            firstName: { equals: parts[0], mode: 'insensitive' },
            deletedAt: null,
          },
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        })
      }
      if (!teacher) {
        teacher = await db.teacher.findFirst({
          where: { schoolId: user.schoolId, deletedAt: null, isActive: true },
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        })
      }
    }

    if (!teacher) {
      const fallbackClasses = await db.class.findMany({
        where: { schoolId: user.schoolId, deletedAt: null, isActive: true },
        include: {
          sections: { where: { deletedAt: null, isActive: true }, orderBy: { name: 'asc' } },
          classSubjects: {
            include: { subject: { select: { id: true, name: true, code: true, type: true, isActive: true } } },
            orderBy: { subject: { sequenceNo: 'asc' } },
          },
        },
      })
      const sorted = sortClassesByNaturalOrder(fallbackClasses)
      return NextResponse.json({
        isAdmin: false,
        teacher: null,
        teachers: [],
        classes: sorted.map((c) => ({
          id: c.id,
          name: c.name,
          sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
          subjects: c.classSubjects.map((cs) => ({
            id: cs.subject.id,
            name: cs.subject.name,
            code: cs.subject.code,
            type: cs.subject.type,
          })),
        })),
        academicYear,
      })
    }

    // Get assignments for this teacher
    const [ctas, tsas, timetables] = await Promise.all([
      db.classTeacherAssignment.findMany({
        where: {
          schoolId: user.schoolId,
          teacherId: teacher.id,
          academicYear,
          deletedAt: null,
        },
        select: { classId: true, sectionId: true },
      }),
      db.teacherSubjectAssignment.findMany({
        where: {
          schoolId: user.schoolId,
          teacherId: teacher.id,
          academicYear,
          deletedAt: null,
        },
        select: { classId: true, sectionId: true, subjectId: true },
      }),
      db.timetable.findMany({
        where: {
          schoolId: user.schoolId,
          teacherId: teacher.id,
          academicYear,
          deletedAt: null,
        },
        select: { classId: true, sectionId: true, subjectId: true },
      }),
    ])

    // Collect all classes the teacher is associated with
    const assignedClassIds = new Set<string>()
    const classLevelCtas = new Set<string>()
    const sectionCtas = new Set<string>()

    for (const c of ctas) {
      assignedClassIds.add(c.classId)
      if (c.sectionId) sectionCtas.add(c.sectionId)
      else classLevelCtas.add(c.classId)
    }

    // Map: classId -> Set of sectionIds teacher teaches
    const classSectionMap = new Map<string, Set<string>>()
    // Map: `${classId}:${sectionId || 'all'}` -> Set of subjectIds
    const subjectMap = new Map<string, Set<string>>()

    for (const t of tsas) {
      assignedClassIds.add(t.classId)
      if (t.sectionId) {
        const secs = classSectionMap.get(t.classId) ?? new Set<string>()
        secs.add(t.sectionId)
        classSectionMap.set(t.classId, secs)
      }
      const key = `${t.classId}:${t.sectionId || 'all'}`
      const subs = subjectMap.get(key) ?? new Set<string>()
      subs.add(t.subjectId)
      subjectMap.set(key, subs)
    }

    for (const row of timetables) {
      assignedClassIds.add(row.classId)
      const secs = classSectionMap.get(row.classId) ?? new Set<string>()
      secs.add(row.sectionId)
      classSectionMap.set(row.classId, secs)

      const key = `${row.classId}:${row.sectionId}`
      const subs = subjectMap.get(key) ?? new Set<string>()
      subs.add(row.subjectId)
      subjectMap.set(key, subs)
    }

    if (assignedClassIds.size === 0) {
      // If no formal assignments are yet set up for this academic year,
      // fallback to allowing teacher to access school classes so they can test/assign homework
      const fallbackClasses = await db.class.findMany({
        where: { schoolId: user.schoolId, deletedAt: null, isActive: true },
        include: {
          sections: { where: { deletedAt: null, isActive: true }, orderBy: { name: 'asc' } },
          classSubjects: {
            include: { subject: { select: { id: true, name: true, code: true, type: true, isActive: true } } },
            orderBy: { subject: { sequenceNo: 'asc' } },
          },
        },
      })
      const sorted = sortClassesByNaturalOrder(fallbackClasses)
      return NextResponse.json({
        isAdmin: false,
        teacher: {
          id: teacher.id,
          name: `${teacher.firstName} ${teacher.lastName}`.trim(),
          employeeId: teacher.employeeId,
        },
        teachers: [{
          id: teacher.id,
          name: `${teacher.firstName} ${teacher.lastName}`.trim(),
          employeeId: teacher.employeeId,
        }],
        classes: sorted.map((c) => ({
          id: c.id,
          name: c.name,
          sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
          subjects: c.classSubjects.map((cs) => ({
            id: cs.subject.id,
            name: cs.subject.name,
            code: cs.subject.code,
            type: cs.subject.type,
          })),
        })),
        academicYear,
      })
    }

    const classes = await db.class.findMany({
      where: {
        id: { in: Array.from(assignedClassIds) },
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        sections: {
          where: { deletedAt: null, isActive: true },
          orderBy: { name: 'asc' },
        },
        classSubjects: {
          include: {
            subject: { select: { id: true, name: true, code: true, type: true, isActive: true } },
          },
          orderBy: { subject: { sequenceNo: 'asc' } },
        },
      },
    })

    const sortedClasses = sortClassesByNaturalOrder(classes)

    const formattedClasses = sortedClasses.map((cls) => {
      const isClassTeacherAll = classLevelCtas.has(cls.id)
      const allowedSections = cls.sections.filter((sec) => {
        if (isClassTeacherAll) return true
        if (sectionCtas.has(sec.id)) return true
        const secs = classSectionMap.get(cls.id)
        return secs?.has(sec.id) ?? false
      })

      // Collect subjects allowed for this teacher in this class
      const classSubjectList = cls.classSubjects
        .filter((cs) => cs.subject && cs.subject.isActive)
        .map((cs) => cs.subject)

      const allowedSubjectIds = new Set<string>()
      // Check class-level subjects
      subjectMap.get(`${cls.id}:all`)?.forEach((id) => allowedSubjectIds.add(id))

      // Check section-level subjects
      for (const sec of allowedSections) {
        subjectMap.get(`${cls.id}:${sec.id}`)?.forEach((id) => allowedSubjectIds.add(id))
      }

      // If class teacher or no specific subject mapping found, allow all subjects of this class
      const finalSubjects =
        allowedSubjectIds.size > 0
          ? classSubjectList.filter((s) => allowedSubjectIds.has(s.id))
          : classSubjectList

      return {
        id: cls.id,
        name: cls.name,
        sections: (allowedSections.length > 0 ? allowedSections : cls.sections).map((s) => ({
          id: s.id,
          name: s.name,
        })),
        subjects: finalSubjects.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          type: s.type,
        })),
      }
    })

    return NextResponse.json({
      isAdmin: false,
      teacher: {
        id: teacher.id,
        name: `${teacher.firstName} ${teacher.lastName}`.trim(),
        employeeId: teacher.employeeId,
      },
      teachers: [{
        id: teacher.id,
        name: `${teacher.firstName} ${teacher.lastName}`.trim(),
        employeeId: teacher.employeeId,
      }],
      classes: formattedClasses,
      academicYear,
    })
  } catch (error) {
    console.error('Error fetching teacher homework classes:', error)
    return internalError('loading teacher homework classes')
  }
}
