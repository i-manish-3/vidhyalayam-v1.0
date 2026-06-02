import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

// GET /api/school/id-cards/students
//   ?academicYear=2026-2027
//   ?classId=...
//   ?sectionId=...
//   ?status=active|withdrawn|alumni|...
//   ?search=name|admission|roll
//   ?ids=cuid1,cuid2,...   (when set, only those students are returned regardless of other filters)
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()
    // Anyone with the read permission can fetch the picker list.
    const allowed = await requirePermission(request, 'idcard:read')
    if (!allowed) return apiError(403, "You don't have permission to view ID card data.")

    const { searchParams } = new URL(request.url)
    const academicYear = searchParams.get('academicYear')?.trim() || ''
    const classId = searchParams.get('classId')?.trim() || ''
    const sectionId = searchParams.get('sectionId')?.trim() || ''
    const status = searchParams.get('status')?.trim() || ''
    const search = searchParams.get('search')?.trim() || ''
    const idsParam = searchParams.get('ids')?.trim() || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10) || 200, 500)

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }

    if (idsParam) {
      const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 500)
      if (!ids.length) return NextResponse.json({ students: [] })
      where.id = { in: ids }
    } else {
      if (status) {
        where.admissionStatus = status
      } else {
        // default: only currently-enrolled students
        where.admissionStatus = { in: ['admitted', 'promoted'] }
      }

      if (academicYear && ACADEMIC_YEAR_PATTERN.test(academicYear)) {
        const enrollmentFilter: Record<string, unknown> = { academicYear, deletedAt: null }
        if (classId) enrollmentFilter.classId = classId
        if (sectionId) enrollmentFilter.sectionId = sectionId
        where.academicEnrollments = { some: enrollmentFilter }
      } else {
        if (classId) where.classId = classId
        if (sectionId) where.sectionId = sectionId
      }

      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { admissionNumber: { contains: search, mode: 'insensitive' } },
          { rollNumber: { contains: search, mode: 'insensitive' } },
        ]
      }
    }

    const students = await db.student.findMany({
      where,
      take: limit,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        rollNumber: true,
        dateOfBirth: true,
        gender: true,
        bloodGroup: true,
        profileImage: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        admissionStatus: true,
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        academicEnrollments: {
          where: academicYear && ACADEMIC_YEAR_PATTERN.test(academicYear) ? { academicYear } : undefined,
          select: {
            academicYear: true,
            rollNumber: true,
            class: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
          },
          orderBy: { academicYear: 'desc' },
          take: 1,
        },
        parentLinks: {
          select: {
            isPrimary: true,
            relation: true,
            parent: {
              select: {
                fatherName: true,
                motherName: true,
                phone: true,
                alternatePhone: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({ students })
  } catch (error) {
    console.error('List id-card students error:', error)
    return internalError('loading students for ID cards')
  }
}
