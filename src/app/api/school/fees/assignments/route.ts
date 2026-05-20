import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'
import { assignStudentFeesFromStructure } from '@/lib/fees'

// GET /api/school/fees/assignments - List student fee snapshots.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || ''
    const academicYear = searchParams.get('academicYear') || ''
    const status = searchParams.get('status') || ''

    const assignments = await db.studentFeeAssignment.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(studentId ? { studentId } : {}),
        ...(academicYear ? { academicYear } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
        feesGroup: { select: { id: true, name: true } },
        feeStructure: { select: { id: true, name: true, version: true } },
        items: { orderBy: { createdAt: 'asc' } },
        invoices: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ assignments })
  } catch (error) {
    console.error('List fee assignments error:', error)
    return internalError('listing fee assignments')
  }
}

// POST /api/school/fees/assignments - Create a student-level fee snapshot from an active class fee structure.
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { studentId, feesGroupId, academicYear, effectiveFrom } = body

    if (!studentId || !feesGroupId || !academicYear) {
      return apiError(400, 'Please select student, fee group, and academic year.')
    }

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, classId: true, sectionId: true },
    })
    if (!student) {
      return apiError(404, 'Student not found.')
    }

    if (!student.classId) {
      return apiError(400, 'Please assign a class to this student before assigning fees.')
    }

    const assignment = await db.$transaction((tx) =>
      assignStudentFeesFromStructure({
        tx,
        schoolId: user.schoolId!,
        studentId,
        classId: student.classId,
        sectionId: student.sectionId,
        feesGroupId,
        academicYear,
        assignedBy: user.userId,
        source: 'manual',
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      })
    )

    if (!assignment) {
      return apiError(404, 'No active fee structure was found for this student, class, fee group, and academic year.')
    }

    return NextResponse.json({ assignment }, { status: 201 })
  } catch (error) {
    console.error('Create fee assignment error:', error)
    return internalError('creating fee assignment')
  }
}
