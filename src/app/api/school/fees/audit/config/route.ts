import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, internalError } from '@/lib/api-errors'

/**
 * GET /api/school/fees/audit/config
 *
 * Query fee configuration audit logs with filtering and pagination.
 * Tracks changes to fee structures, demand configs, fee heads, and fee groups.
 */
const CREATED_ACTIONS = ['created', 'monthly_demand_generated']
const UPDATED_ACTIONS = ['updated']
const DELETED_ACTIONS = ['deleted', 'refund_voided']

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    // Check permission
    if (user.role !== 'SUPER_ADMIN') {
      const ok = await requirePermission(request, 'fees:audit')
      if (!ok) return forbiddenError("You don't have access to fee audit logs.")
    }

    const { searchParams } = new URL(request.url)

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const skip = (page - 1) * limit

    // Filters
    const configType = searchParams.get('configType') || undefined
    const userId = searchParams.get('userId') || undefined
    const action = searchParams.get('action') || undefined
    const actionGroup = searchParams.get('actionGroup') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined

    // Build where clause
    const where: any = {
      schoolId: user.schoolId,
    }

    if (configType) {
      where.configType = configType
    }

    if (userId) {
      where.userId = userId
    }

    if (actionGroup === 'created') {
      where.action = { in: CREATED_ACTIONS }
    } else if (actionGroup === 'updated') {
      where.action = { in: UPDATED_ACTIONS }
    } else if (actionGroup === 'deleted') {
      where.action = { in: DELETED_ACTIONS }
    } else if (action) {
      where.action = action
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        where.createdAt.gte = new Date(startDate)
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate)
      }
    }

    // Execute query with pagination
    const [logs, total, createdCount, updatedCount, deletedCount] = await Promise.all([
      db.feeConfigAuditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      db.feeConfigAuditLog.count({ where }),
      db.feeConfigAuditLog.count({ where: { ...where, action: { in: CREATED_ACTIONS } } }),
      db.feeConfigAuditLog.count({ where: { ...where, action: { in: UPDATED_ACTIONS } } }),
      db.feeConfigAuditLog.count({ where: { ...where, action: { in: DELETED_ACTIONS } } }),
    ])

    // Parse JSON fields
    const parsedLogs = logs.map(log => ({
      ...log,
      oldValue: log.oldValue ? JSON.parse(log.oldValue) : null,
      newValue: log.newValue ? JSON.parse(log.newValue) : null,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    }))

    return NextResponse.json({
      logs: parsedLogs,
      stats: {
        total,
        created: createdCount,
        updated: updatedCount,
        deleted: deletedCount,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Fetch fee config audit logs error:', error)
    return internalError('fetching fee config audit logs')
  }
}
