import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { validateAcademicYear } from '@/lib/validators'
import { sortClassesByNaturalOrder } from '@/lib/class-order'

type ClassTeacherAssignmentWithTeacher = {
  id: string
  academicYear: string
  teacherId: string
  teacher: {
    id: string
    firstName: string
    lastName: string
    employeeId: string | null
    profileImage: string | null
    isActive: boolean
  }
}

type SectionInput = {
  name?: string
  teacherId?: string | null
}

type CreatedClassRecord = {
  id: string
  schoolId: string
  name: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  sections: Array<{ id: string; name: string }>
  classSubjects: Array<{
    subject: {
      id: string
      name: string
      code: string | null
      type: string
      sequenceNo: number | null
      isActive: boolean
    }
  }>
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

// GET /api/school/classes - List classes with sections and subjects
// Optional query param: academicYear — when present, restricts results to classes
// that have at least one active FeesStructure for that academic year.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const academicYear = request.nextUrl.searchParams.get('academicYear')?.trim() || null
    const assignmentAcademicYear = request.nextUrl.searchParams.get('assignmentAcademicYear')?.trim() || null

    if (assignmentAcademicYear) {
      const academicYearError = validateAcademicYear(assignmentAcademicYear)
      if (academicYearError) return apiError(400, academicYearError)
    }

    const classes = await db.class.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(academicYear
          ? {
              feesStructures: {
                some: {
                  academicYear,
                  isActive: true,
                  status: 'active',
                  deletedAt: null,
                },
              },
            }
          : {}),
      },
      include: {
        sections: {
          where: { deletedAt: null },
          include: {
            classTeacherAssignments: assignmentAcademicYear
              ? {
                  where: {
                    schoolId: user.schoolId,
                    academicYear: assignmentAcademicYear,
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
                }
              : false,
            _count: {
              select: { students: { where: { deletedAt: null } } },
            },
          },
          orderBy: { name: 'asc' },
        },
        classTeacherAssignments: assignmentAcademicYear
          ? {
              where: {
                schoolId: user.schoolId,
                academicYear: assignmentAcademicYear,
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
            }
          : false,
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

    // Transform: flatten classSubjects into a subjects array
    const classesWithSubjects = classes.map(cls => {
      const { classSubjects, classTeacherAssignments, ...classData } = cls
      const classAssignment = (classTeacherAssignments?.[0] || null) as unknown as ClassTeacherAssignmentWithTeacher | null
      const sections = classData.sections.map((section) => {
        const { classTeacherAssignments, ...sectionData } = section
        const assignment = (classTeacherAssignments?.[0] || null) as unknown as ClassTeacherAssignmentWithTeacher | null
        return {
          ...sectionData,
          classTeacherAssignment: assignment
            ? {
                id: assignment.id,
                academicYear: assignment.academicYear,
                teacherId: assignment.teacherId,
                teacher: assignment.teacher,
              }
            : null,
          classTeacher: assignment?.teacher || null,
        }
      })
      return {
        ...classData,
        sections,
        classTeacherAssignment: classAssignment
          ? {
              id: classAssignment.id,
              academicYear: classAssignment.academicYear,
              teacherId: classAssignment.teacherId,
              teacher: classAssignment.teacher,
            }
          : null,
        classTeacher: classAssignment?.teacher || null,
        subjects: classSubjects.map(cs => cs.subject),
      }
    })

    return NextResponse.json({ classes: sortClassesByNaturalOrder(classesWithSubjects) })
  } catch (error) {
    console.error('List classes error:', error)
    return internalError('listing classes')
  }
}

// POST /api/school/classes - Create class with optional subjects
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'class:create')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to create classes.")
    }
    const schoolId = user.schoolId

    const body = await request.json()
    const { name, sections, subjectIds, academicYear, classTeacherId } = body

    // Name is required
    if (!name || !name.trim()) {
      return apiError(400, 'Class name is required. Please provide a name like Class 1, Class 10, or Nursery.')
    }

    // Check for duplicate name
    const existing = await db.class.findFirst({
      where: { schoolId, name: name.trim(), deletedAt: null },
    })
    if (existing) {
      return apiError(400, 'A class with this name already exists in your school. Please use a different name.')
    }

    const namedSections = Array.isArray(sections)
      ? sections
          .filter((section: SectionInput) => section.name?.trim())
          .map((section: SectionInput) => ({
            name: section.name!.trim(),
            teacherId: section.teacherId?.trim() || null,
          }))
      : []
    const classTeacherRows = namedSections.filter((section) => section.teacherId)
    const classLevelTeacherId = namedSections.length === 0 && typeof classTeacherId === 'string'
      ? classTeacherId.trim()
      : ''
    const assignmentAcademicYear = typeof academicYear === 'string' ? academicYear.trim() : ''
    const selectedClassTeacherIds = [
      ...classTeacherRows.map((section) => section.teacherId as string),
      ...(classLevelTeacherId ? [classLevelTeacherId] : []),
    ]

    if (selectedClassTeacherIds.length > 0) {
      const academicYearError = validateAcademicYear(assignmentAcademicYear, true)
      if (academicYearError) return apiError(400, academicYearError)

      const teacherIds = Array.from(new Set(selectedClassTeacherIds))

      const teachers = await db.teacher.findMany({
        where: {
          id: { in: teacherIds },
          schoolId,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      })
      const validTeacherIds = new Set(teachers.map((teacher) => teacher.id))
      const invalidTeacher = teacherIds.find((teacherId) => !validTeacherIds.has(teacherId))
      if (invalidTeacher) {
        return apiError(400, 'One or more selected teachers are inactive or do not belong to this school.')
      }

      const conflicts = await db.classTeacherAssignment.findMany({
        where: {
          schoolId,
          academicYear: assignmentAcademicYear,
          teacherId: { in: teacherIds },
          deletedAt: null,
        },
        include: {
          class: { select: { name: true } },
          section: { select: { name: true } },
          teacher: { select: { firstName: true, lastName: true } },
        },
      })
      if (conflicts.length > 0) {
        return apiError(400, formatClassTeacherConflict(conflicts[0], assignmentAcademicYear))
      }
    }

    // Validate subjectIds if provided
    if (subjectIds && subjectIds.length > 0) {
      const validSubjects = await db.subject.findMany({
        where: {
          id: { in: subjectIds },
          schoolId: user.schoolId,
          deletedAt: null,
        },
        select: { id: true },
      })
      const validIds = new Set(validSubjects.map(s => s.id))
      const invalidIds = subjectIds.filter((id: string) => !validIds.has(id))
      if (invalidIds.length > 0) {
        return apiError(400, 'Some selected subjects are invalid or do not belong to your school.')
      }
    }

    const classRecord = await db.$transaction(async (tx) => {
      const createdClass = await tx.class.create({
        data: {
          schoolId,
          name: name.trim(),
          sections: namedSections.length
            ? {
                create: namedSections.map((section) => ({
                  schoolId,
                  name: section.name,
                })),
              }
            : undefined,
          classSubjects: subjectIds?.length
            ? {
                create: subjectIds.map((subjectId: string) => ({
                  subjectId,
                })),
              }
            : undefined,
        },
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
      }) as unknown as CreatedClassRecord

      if (classTeacherRows.length > 0) {
        const sectionIdByName = new Map(
          createdClass.sections.map((section) => [section.name.trim().toLowerCase(), section.id])
        )
        await tx.classTeacherAssignment.createMany({
          data: classTeacherRows.map((section) => ({
            schoolId,
            academicYear: assignmentAcademicYear,
            classId: createdClass.id,
            sectionId: sectionIdByName.get(section.name.toLowerCase()) as string,
            teacherId: section.teacherId as string,
          })),
        })
      }

      if (classLevelTeacherId) {
        await tx.classTeacherAssignment.create({
          data: {
            schoolId,
            academicYear: assignmentAcademicYear,
            classId: createdClass.id,
            sectionId: null,
            teacherId: classLevelTeacherId,
          },
        })
      }

      return createdClass
    })

    // Flatten classSubjects
    const { classSubjects, ...classData } = classRecord
    return NextResponse.json({
      ...classData,
      subjects: classSubjects.map(cs => cs.subject),
    }, { status: 201 })
  } catch (error) {
    console.error('Create class error:', error)
    return internalError('creating the class')
  }
}
