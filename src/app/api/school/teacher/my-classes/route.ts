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

// GET /api/school/teacher/my-classes
// Returns only the classes/sections the authenticated teacher is assigned to —
// either as class teacher (ClassTeacherAssignment) or as subject teacher (Timetable).
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['TEACHER'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const academicYear = await resolveAcademicYear(
      user.schoolId,
      request.nextUrl.searchParams.get('academicYear')
    )
    if (!academicYear) {
      return apiError(400, 'Academic year is invalid or not configured. Please contact your school admin.')
    }

    const teacher = await db.teacher.findFirst({
      where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
      select: { id: true },
    })

    if (!teacher) {
      return NextResponse.json({ classes: [], teacherId: null, academicYear })
    }

    const [ctas, timetableRows] = await Promise.all([
      db.classTeacherAssignment.findMany({
        where: {
          schoolId: user.schoolId,
          teacherId: teacher.id,
          academicYear,
          deletedAt: null,
        },
        select: { classId: true, sectionId: true },
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

    // A class-level CTA (sectionId === null) means this teacher is class teacher for
    // every section of that class. Section-level CTAs name a specific section.
    const classLevelCtaClassIds = new Set<string>()
    const sectionCtaIds = new Set<string>()
    for (const cta of ctas) {
      if (cta.sectionId) sectionCtaIds.add(cta.sectionId)
      else classLevelCtaClassIds.add(cta.classId)
    }

    const timetableSectionIds = new Set<string>()
    const timetableSubjectMap = new Map<string, Set<string>>()
    for (const row of timetableRows) {
      timetableSectionIds.add(row.sectionId)
      const subjects = timetableSubjectMap.get(row.sectionId) ?? new Set<string>()
      subjects.add(row.subjectId)
      timetableSubjectMap.set(row.sectionId, subjects)
    }

    const candidateClassIds = new Set<string>(classLevelCtaClassIds)
    for (const cta of ctas) candidateClassIds.add(cta.classId)
    for (const row of timetableRows) candidateClassIds.add(row.classId)

    if (candidateClassIds.size === 0) {
      return NextResponse.json({ classes: [], teacherId: teacher.id, academicYear })
    }

    const classes = await db.class.findMany({
      where: {
        id: { in: Array.from(candidateClassIds) },
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        sections: {
          where: { deletedAt: null },
          include: {
            classTeacherAssignments: {
              where: {
                schoolId: user.schoolId,
                academicYear,
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
              take: 1,
            },
            _count: {
              select: { students: { where: { deletedAt: null } } },
            },
          },
          orderBy: { name: 'asc' },
        },
        classTeacherAssignments: {
          where: {
            schoolId: user.schoolId,
            academicYear,
            sectionId: null,
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
          take: 1,
        },
        classSubjects: {
          include: {
            subject: {
              select: {
                id: true,
                name: true,
                code: true,
                type: true,
                sequenceNo: true,
                isActive: true,
              },
            },
          },
          orderBy: { subject: { sequenceNo: 'asc' } },
        },
        _count: {
          select: { students: { where: { deletedAt: null } } },
        },
      },
      orderBy: { name: 'asc' },
    })

    const transformed = classes.map((cls) => {
      const includeAllSections = classLevelCtaClassIds.has(cls.id)

      const filteredSections = cls.sections
        .filter((section) => {
          if (includeAllSections) return true
          if (sectionCtaIds.has(section.id)) return true
          if (timetableSectionIds.has(section.id)) return true
          return false
        })
        .map((section) => {
          const { classTeacherAssignments, ...sectionData } = section
          const assignment = classTeacherAssignments?.[0] ?? null
          const subjectIds = Array.from(timetableSubjectMap.get(section.id) ?? [])
          const isClassTeacher = includeAllSections || sectionCtaIds.has(section.id)
          const isSubjectTeacher = timetableSectionIds.has(section.id)
          const teacherRole: 'class_teacher' | 'subject_teacher' | 'both' =
            isClassTeacher && isSubjectTeacher
              ? 'both'
              : isClassTeacher
                ? 'class_teacher'
                : 'subject_teacher'
          return {
            ...sectionData,
            classTeacher: assignment?.teacher ?? null,
            teacherSubjectIds: subjectIds,
            teacherRole,
          }
        })

      const { classSubjects, classTeacherAssignments, ...classData } = cls
      const classAssignment = classTeacherAssignments?.[0] ?? null

      return {
        ...classData,
        sections: filteredSections,
        classTeacher: classAssignment?.teacher ?? null,
        subjects: classSubjects.map((cs) => cs.subject),
      }
    })

    const finalClasses = transformed.filter((cls) => cls.sections.length > 0)

    return NextResponse.json({
      classes: sortClassesByNaturalOrder(finalClasses),
      teacherId: teacher.id,
      academicYear,
    })
  } catch (error) {
    console.error('Teacher my-classes error:', error)
    return internalError('loading your classes')
  }
}
