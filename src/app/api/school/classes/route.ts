import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

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
            _count: {
              select: { students: { where: { deletedAt: null } } },
            },
          },
          orderBy: { name: 'asc' },
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

    // Transform: flatten classSubjects into a subjects array
    const classesWithSubjects = classes.map(cls => {
      const { classSubjects, ...classData } = cls
      return {
        ...classData,
        subjects: classSubjects.map(cs => cs.subject),
      }
    })

    return NextResponse.json({ classes: classesWithSubjects })
  } catch (error) {
    console.error('List classes error:', error)
    return internalError('listing classes')
  }
}

// POST /api/school/classes - Create class with optional subjects
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { name, sections, subjectIds } = body

    // Name is required
    if (!name || !name.trim()) {
      return apiError(400, 'Class name is required. Please provide a name like Class 1, Class 10, or Nursery.')
    }

    // Check for duplicate name
    const existing = await db.class.findFirst({
      where: { schoolId: user.schoolId, name: name.trim(), deletedAt: null },
    })
    if (existing) {
      return apiError(400, 'A class with this name already exists in your school. Please use a different name.')
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

    const classRecord = await db.class.create({
      data: {
        schoolId: user.schoolId,
        name: name.trim(),
        sections: sections
          ? {
              create: sections
                .filter((s: { name: string }) => s.name?.trim())
                .map((s: { name: string }) => ({
                  schoolId: user.schoolId!,
                  name: s.name.trim(),
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
