import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/salary/payments - List salary payments
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const teacherId = searchParams.get('teacherId') || ''
    const month = searchParams.get('month') || ''
    const year = searchParams.get('year') || ''
    const paymentStatus = searchParams.get('paymentStatus') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
    }
    if (teacherId) where.teacherId = teacherId
    if (month) where.month = parseInt(month)
    if (year) where.year = parseInt(year)
    if (paymentStatus) where.paymentStatus = paymentStatus

    const [payments, total] = await Promise.all([
      db.salaryPayment.findMany({
        where,
        include: {
          teacher: {
            select: { id: true, firstName: true, lastName: true, employeeId: true },
          },
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        skip,
        take: limit,
      }),
      db.salaryPayment.count({ where }),
    ])

    return NextResponse.json({
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List salary payments error:', error)
    return internalError('listing salary payments')
  }
}

// POST /api/school/salary/payments - Generate/process salary payment
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const {
      teacherId,
      month,
      year,
      paymentMethod,
      transactionRef,
      action, // 'generate' or 'process'
    } = body

    if (!teacherId || !month || !year) {
      return apiError(400, 'Please select a teacher, month, and year to generate the salary payment.')
    }

    // Verify teacher belongs to this school
    const teacher = await db.teacher.findFirst({
      where: { id: teacherId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!teacher) {
      return notFoundError('Teacher')
    }

    // Check if payment already exists for this month/year
    const existingPayment = await db.salaryPayment.findUnique({
      where: {
        schoolId_teacherId_month_year: {
          schoolId: user.schoolId,
          teacherId,
          month: parseInt(month),
          year: parseInt(year),
        },
      },
    })

    if (existingPayment && action !== 'process') {
      return NextResponse.json(
        { message: 'This teacher\'s salary has already been processed for this month. You can view it in the salary payments list.', payment: existingPayment },
        { status: 400 }
      )
    }

    // Get salary structure
    const salaryStructure = await db.salaryStructure.findUnique({
      where: { teacherId },
    })
    if (!salaryStructure) {
      return apiError(400, 'This teacher doesn\'t have a salary structure yet. Please create one before processing payments.')
    }

    // Check for approved advance deductions for this month
    const advanceDeduction = await db.advanceRequest.aggregate({
      where: {
        schoolId: user.schoolId,
        teacherId,
        approvalStatus: 'approved',
        deductionMonth: parseInt(month),
        deductionYear: parseInt(year),
      },
      _sum: { amount: true },
    })

    const advanceDed = advanceDeduction._sum.amount || 0

    const grossEarnings = salaryStructure.grossSalary
    const totalDeductions = salaryStructure.pf + salaryStructure.esi + salaryStructure.tax + salaryStructure.otherDeductions + advanceDed
    const netPayable = grossEarnings - totalDeductions

    if (existingPayment && action === 'process') {
      // Process (mark as paid)
      const updated = await db.salaryPayment.update({
        where: { id: existingPayment.id },
        data: {
          paymentStatus: 'paid',
          paymentDate: new Date(),
          paymentMethod: paymentMethod || 'bank_transfer',
          transactionRef,
          advanceDeduction: advanceDed,
          totalDeductions,
          netPayable,
        },
        include: {
          teacher: {
            select: { id: true, firstName: true, lastName: true, employeeId: true },
          },
        },
      })
      return NextResponse.json(updated)
    }

    // Generate new salary payment
    const payment = await db.salaryPayment.create({
      data: {
        schoolId: user.schoolId,
        teacherId,
        salaryStructureId: salaryStructure.id,
        month: parseInt(month),
        year: parseInt(year),
        basicSalary: salaryStructure.basicSalary,
        hra: salaryStructure.hra,
        da: salaryStructure.da,
        ta: salaryStructure.ta,
        medicalAllowance: salaryStructure.medicalAllowance,
        specialAllowance: salaryStructure.specialAllowance,
        grossEarnings,
        pf: salaryStructure.pf,
        esi: salaryStructure.esi,
        tax: salaryStructure.tax,
        advanceDeduction: advanceDed,
        otherDeductions: salaryStructure.otherDeductions,
        totalDeductions,
        netPayable,
        paymentStatus: 'pending',
        generatedOn: new Date(),
      },
      include: {
        teacher: {
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        },
      },
    })

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    console.error('Create salary payment error:', error)
    return internalError('processing the salary payment')
  }
}
