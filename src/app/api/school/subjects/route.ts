import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

const VALID_TYPES = ['primary', 'optional', 'extra', 'special']

// GET /api/school/subjects - List subjects (optional ?classId= filter)
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId')

    // If classId is provided, filter subjects assigned to that class
    if (classId) {
      const classSubjects = await db.classSubject.findMany({
        where: {
          classId,
          subject: { deletedAt: null },
        },
        include: {
          subject: true,
          class: { select: { id: true, name: true } },
        },
        orderBy: { subject: { sequenceNo: 'asc' } },
      })

      const subjects = classSubjects.map(cs => ({
        ...cs.subject,
        classes: [cs.class],
      }))

      return NextResponse.json({ subjects, classId })
    }

    // No classId — return all subjects with their assigned classes
    const subjects = await db.subject.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        classSubjects: {
          include: {
            class: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { sequenceNo: 'asc' },
        { name: 'asc' },
      ],
    })

    const subjectsWithClasses = subjects.map(s => {
      const { classSubjects, ...subjectData } = s
      return {
        ...subjectData,
        classes: classSubjects.map(cs => cs.class),
      }
    })

    return NextResponse.json({ subjects: subjectsWithClasses })
  } catch (error) {
    console.error('List subjects error:', error)
    return internalError('listing subjects')
  }
}

// POST /api/school/subjects - Create subject
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { name, code, sequenceNo, type, isActive, classIds } = body

    if (!name) {
      return apiError(400, 'Please enter a subject name (e.g., Mathematics, English).')
    }

    // Validate type
    if (type && !VALID_TYPES.includes(type)) {
      return apiError(400, 'Subject type must be Primary, Optional, Extra, or Special. Please choose a valid type.')
    }

    // Check if subject code already exists (code must be unique, name can be duplicated)
    if (code && code.trim()) {
      const existingCode = await db.subject.findFirst({
        where: { schoolId: user.schoolId, code: code.trim(), deletedAt: null },
      })
      if (existingCode) {
        return apiError(400, `A subject with code "${code.trim()}" already exists. Please use a different code.`)
      }
    }

    const subject = await db.subject.create({
      data: {
        schoolId: user.schoolId,
        name,
        code: code || null,
        sequenceNo: sequenceNo != null ? sequenceNo : null,
        type: type || 'primary',
        isActive: isActive !== undefined ? isActive : true,
        // Create class associations if provided
        classSubjects: classIds?.length
          ? {
              create: classIds.map((cId: string) => ({
                classId: cId,
              })),
            }
          : undefined,
      },
      include: {
        classSubjects: {
          include: { class: { select: { id: true, name: true } } },
        },
      },
    })

    const { classSubjects, ...subjectData } = subject
    return NextResponse.json({
      ...subjectData,
      classes: classSubjects.map(cs => cs.class),
    }, { status: 201 })
  } catch (error) {
    console.error('Create subject error:', error)
    return internalError('creating the subject')
  }
}
