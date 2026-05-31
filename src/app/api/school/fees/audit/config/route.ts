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

    if (action) {
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
    const [logs, total] = await Promise.all([
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
