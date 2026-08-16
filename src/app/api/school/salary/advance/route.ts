import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { resolveStaff, resolveStaffMap, isStaffType, staffKey } from '@/lib/salary/staff-resolver'
import { logSalaryEvent, extractSalaryAuditContext } from '@/lib/salary/audit'

// GET /api/school/salary/advance - List advance requests
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'salary:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view salary advances.")
    }

    const { searchParams } = new URL(request.url)
    const staffType = searchParams.get('staffType') || ''
    const staffId = searchParams.get('staffId') || ''
    const approvalStatus = searchParams.get('approvalStatus') || ''
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20'), 1), 100)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
    }
    if (isStaffType(staffType)) where.staffType = staffType
    if (staffId) where.staffId = staffId
    if (approvalStatus) where.approvalStatus = approvalStatus

    const [requests, total, statusGroups] = await Promise.all([
      db.advanceRequest.findMany({
        where,
        orderBy: { requestDate: 'desc' },
        skip,
        take: limit,
      }),
      db.advanceRequest.count({ where }),
      db.advanceRequest.groupBy({
        by: ['approvalStatus'],
        where,
        _sum: { amount: true, deductedAmount: true },
      }),
    ])

    const statusStats: Record<string, number> = { approved: 0, pending: 0, rejected: 0 }
    let outstanding = 0
    for (const g of statusGroups) {
      statusStats[g.approvalStatus] = g._sum.amount ?? 0
      if (g.approvalStatus === 'approved') {
        outstanding += (g._sum.amount ?? 0) - (g._sum.deductedAmount ?? 0)
      }
    }

    const staffMap = await resolveStaffMap(
      db,
      user.schoolId,
      requests.map((r: { staffType: string; staffId: string }) => ({ staffType: r.staffType, staffId: r.staffId }))
    )
    const withStaff = requests.map((r: { staffType: string; staffId: string }) => {
      const staff = staffMap.get(staffKey(r.staffType, r.staffId)) || null
      return {
        ...r,
        staff,
        staffName: staff?.fullName || '',
        staffEmployeeId: staff?.employeeId || '',
      }
    })

    return NextResponse.json({
      requests: withStaff,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total,
        approved: statusStats.approved,
        pending: statusStats.pending,
        rejected: statusStats.rejected,
        outstanding,
      },
    })
  } catch (error) {
    console.error('List advance requests error:', error)
    return internalError('listing advance requests')
  }
}

// POST /api/school/salary/advance - Create advance request
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'salary:advance')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to request salary advances.")
    }

    const body = await request.json()
    const { staffType, staffId, amount, reason, requestDate, deductionMonth, deductionYear } = body

    if (!isStaffType(staffType) || !staffId || !amount) {
      return apiError(400, 'Please select a staff member and enter the advance amount.')
    }
    if (Number(amount) <= 0) {
      return apiError(400, 'The advance amount must be greater than zero.')
    }

    const staff = await resolveStaff(db, user.schoolId, staffType, staffId)
    if (!staff) {
      return notFoundError('Staff member')
    }

    const auditContext = extractSalaryAuditContext(request, user.userId)

    const advanceRequest = await db.$transaction(async (tx: typeof db) => {
      const created = await tx.advanceRequest.create({
        data: {
          schoolId: user.schoolId!,
          staffType,
          staffId,
          amount: Number(amount),
          reason,
          requestDate: requestDate ? new Date(requestDate) : new Date(),
          deductionMonth,
          deductionYear,
        },
      })
      await logSalaryEvent(tx, user.schoolId!, 'AdvanceRequest', created.id, 'created', null, created, {
        ...auditContext,
        staffType,
        staffId,
        diffSummary: `Advance of ${amount} requested for ${staff.fullName}`,
      })
      return created
    })

    return NextResponse.json({ ...advanceRequest, staff }, { status: 201 })
  } catch (error) {
    console.error('Create advance request error:', error)
    return internalError('creating the advance request')
  }
}
