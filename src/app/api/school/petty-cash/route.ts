import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/petty-cash - List entries
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || ''
    const approvalStatus = searchParams.get('approvalStatus') || ''
    const category = searchParams.get('category') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
    }
    if (type) where.type = type
    if (approvalStatus) where.approvalStatus = approvalStatus
    if (category) where.category = category

    const [entries, total] = await Promise.all([
      db.pettyCashEntry.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      db.pettyCashEntry.count({ where }),
    ])

    // Summary stats
    const creditTotal = await db.pettyCashEntry.aggregate({
      where: { schoolId: user.schoolId, type: 'credit', approvalStatus: 'approved' },
      _sum: { amount: true },
    })
    const debitTotal = await db.pettyCashEntry.aggregate({
      where: { schoolId: user.schoolId, type: 'debit', approvalStatus: 'approved' },
      _sum: { amount: true },
    })

    return NextResponse.json({
      entries,
      summary: {
        totalCredits: creditTotal._sum.amount || 0,
        totalDebits: debitTotal._sum.amount || 0,
        balance: (creditTotal._sum.amount || 0) - (debitTotal._sum.amount || 0),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List petty cash error:', error)
    return internalError('listing petty cash entries')
  }
}

// POST /api/school/petty-cash - Create entry (auto-approve if admin, pending if teacher)
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'petty_cash:create')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to create petty cash entries.")
    }

    const body = await request.json()
    const { amount, type, category, description, date } = body

    if (!amount || !type) {
      return apiError(400, 'Please enter the amount and select whether this is money received (credit) or spent (debit).')
    }

    if (!['credit', 'debit'].includes(type)) {
      return apiError(400, 'Please select whether this is money received (credit) or spent (debit).')
    }

    // Auto-approve if admin, pending if teacher
    const approvalStatus = user.role === 'SCHOOL_ADMIN' ? 'approved' : 'pending'
    const approvedBy = user.role === 'SCHOOL_ADMIN' ? user.userId : null

    const entry = await db.pettyCashEntry.create({
      data: {
        schoolId: user.schoolId,
        amount,
        type,
        category,
        description,
        createdBy: user.userId,
        approvedBy,
        approvalStatus,
        date: date ? new Date(date) : new Date(),
      },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Create petty cash entry error:', error)
    return internalError('creating the petty cash entry')
  }
}
