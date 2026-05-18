import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/salary/structures - List salary structures
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const teacherId = searchParams.get('teacherId') || ''

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
    }
    if (teacherId) where.teacherId = teacherId

    const structures = await db.salaryStructure.findMany({
      where,
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ structures })
  } catch (error) {
    console.error('List salary structures error:', error)
    return internalError('listing salary structures')
  }
}

// POST /api/school/salary/structures - Create salary structure
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const {
      teacherId,
      basicSalary,
      hra,
      da,
      ta,
      medicalAllowance,
      specialAllowance,
      pf,
      esi,
      tax,
      otherDeductions,
      effectiveFrom,
    } = body

    if (!teacherId || basicSalary === undefined) {
      return apiError(400, 'Please select a teacher and enter their basic salary amount.')
    }

    // Verify teacher belongs to this school
    const teacher = await db.teacher.findFirst({
      where: { id: teacherId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!teacher) {
      return apiError(404, 'We couldn\'t find this teacher\'s record. They may have been removed.')
    }

    const basic = basicSalary || 0
    const hraVal = hra || 0
    const daVal = da || 0
    const taVal = ta || 0
    const medical = medicalAllowance || 0
    const special = specialAllowance || 0
    const pfVal = pf || 0
    const esiVal = esi || 0
    const taxVal = tax || 0
    const otherDed = otherDeductions || 0

    const grossSalary = basic + hraVal + daVal + taVal + medical + special
    const totalDeductions = pfVal + esiVal + taxVal + otherDed
    const netSalary = grossSalary - totalDeductions

    const structure = await db.salaryStructure.create({
      data: {
        schoolId: user.schoolId,
        teacherId,
        basicSalary: basic,
        hra: hraVal,
        da: daVal,
        ta: taVal,
        medicalAllowance: medical,
        specialAllowance: special,
        pf: pfVal,
        esi: esiVal,
        tax: taxVal,
        otherDeductions: otherDed,
        grossSalary,
        netSalary,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      },
      include: {
        teacher: {
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        },
      },
    })

    return NextResponse.json(structure, { status: 201 })
  } catch (error) {
    console.error('Create salary structure error:', error)
    return internalError('creating the salary structure')
  }
}
