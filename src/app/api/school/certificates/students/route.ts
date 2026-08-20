import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'

// GET /api/school/certificates/students
// Student picker for the issue page. Mirrors the id-cards student picker but
// gated on the certificate:issue permission. Includes parent names + class
// info so the form can preview the certificate data before issuing.
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'certificate:issue')
    if (!user?.schoolId) return unauthorizedError()
    if (!user) return apiError(403, "You don't have permission to issue certificates.")

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId')?.trim() || ''
    const sectionId = searchParams.get('sectionId')?.trim() || ''
    const search = searchParams.get('search')?.trim() || ''
    const status = searchParams.get('status')?.trim() || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 300)

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }
    if (status) {
      where.admissionStatus = status
    } else {
      where.admissionStatus = { in: ['admitted', 'promoted'] }
    }
    if (classId) where.classId = classId
    if (sectionId) where.sectionId = sectionId
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { admissionNumber: { contains: search, mode: 'insensitive' } },
        { rollNumber: { contains: search, mode: 'insensitive' } },
      ]
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
        admissionStatus: true,
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        parentLinks: {
          select: {
            isPrimary: true,
            relation: true,
            parent: { select: { fatherName: true, motherName: true, phone: true } },
          },
        },
      },
    })

    return NextResponse.json({ students })
  } catch (error) {
    console.error('List certificate students error:', error)
    return internalError('loading students for certificates')
  }
}