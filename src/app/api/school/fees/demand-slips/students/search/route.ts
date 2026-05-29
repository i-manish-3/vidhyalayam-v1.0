// Lightweight student search for the Fee Demand Slip generator.
//
// The generic /api/school/students search filters by academic year — which is
// correct for academic pages but wrong here. For billing we follow the same
// rule as the bulk generator (resolveStudentIds): any active student in the
// school is billable, regardless of which academic year their enrollment row
// lives in. Otherwise students enrolled in older AYs (carried forward into
// the current calendar year) can't be billed individually.

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { forbiddenError, internalError, unauthorizedError } from '@/lib/api-errors'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const ok = await requirePermission(request, 'fees:read')
      if (!ok) return forbiddenError("You don't have permission to search students.")
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()
    const limitRaw = Number(searchParams.get('limit'))
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT

    if (q.length < 2) {
      return NextResponse.json({ students: [] })
    }

    const where: Prisma.StudentWhereInput = {
      schoolId: user.schoolId,
      isActive: true,
      deletedAt: null,
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { admissionNumber: { contains: q, mode: 'insensitive' } },
        { rollNumber: { contains: q, mode: 'insensitive' } },
      ],
    }

    const students = await db.student.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: limit,
    })

    return NextResponse.json({ students })
  } catch (error) {
    console.error('Demand slip student search error:', error)
    return internalError('searching students')
  }
}
