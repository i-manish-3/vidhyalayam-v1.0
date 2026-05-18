import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/fees/collections - List fee collections (payments)
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || ''
    const paymentStatus = searchParams.get('paymentStatus') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }
    if (studentId) where.studentId = studentId
    if (paymentStatus) where.paymentStatus = paymentStatus

    const [collections, total] = await Promise.all([
      db.feeCollection.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              rollNumber: true,
              class: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.feeCollection.count({ where }),
    ])

    return NextResponse.json({
      collections,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List fee collections error:', error)
    return internalError('listing fee collections')
  }
}

// POST /api/school/fees/collections - Record fee payment (partial/full)
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const {
      studentId,
      feeStructureItemId,
      amount,
      paidAmount,
      discount,
      concession,
      scholarship,
      fine,
      paymentMethod,
      transactionRef,
      paymentDate,
      receiptNumber,
      dueDate,
      installmentName,
      feeHeadName,
      notes,
    } = body

    if (!studentId || !amount) {
      return apiError(400, 'Please select a student and enter the fee amount.')
    }

    // Verify student belongs to this school
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!student) {
      return apiError(404, 'We couldn\'t find this student\'s record. They may have been removed.')
    }

    const actualPaid = paidAmount || 0
    const totalDiscount = (discount || 0) + (concession || 0) + (scholarship || 0)
    const effectiveAmount = amount - totalDiscount + (fine || 0)

    let paymentStatus = 'unpaid'
    if (actualPaid >= effectiveAmount) {
      paymentStatus = 'paid'
    } else if (actualPaid > 0) {
      paymentStatus = 'partial'
    }

    // Generate receipt number if not provided
    const generatedReceipt = receiptNumber || `RCP-${Date.now()}`

    const collection = await db.feeCollection.create({
      data: {
        schoolId: user.schoolId,
        studentId,
        feeStructureItemId,
        amount,
        paidAmount: actualPaid,
        discount: discount || 0,
        concession: concession || 0,
        scholarship: scholarship || 0,
        fine: fine || 0,
        paymentStatus,
        paymentMethod,
        transactionRef,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        receiptNumber: generatedReceipt,
        dueDate: dueDate ? new Date(dueDate) : null,
        installmentName,
        feeHeadName,
        notes,
      },
    })

    return NextResponse.json(collection, { status: 201 })
  } catch (error) {
    console.error('Record fee payment error:', error)
    return internalError('recording the fee payment')
  }
}
