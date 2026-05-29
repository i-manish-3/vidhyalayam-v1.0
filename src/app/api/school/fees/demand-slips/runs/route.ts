import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { forbiddenError, internalError, unauthorizedError } from '@/lib/api-errors'

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const ok = await requirePermission(request, 'fees:read')
      if (!ok) return forbiddenError("You don't have permission to view demand-slip runs.")
    }

    const runs = await db.feeDemandRun.findMany({
      where: { schoolId: user.schoolId },
      orderBy: [{ startedAt: 'desc' }],
      take: 25,
    })

    const userIds = Array.from(new Set(runs.map((r) => r.triggeredBy).filter((id): id is string => !!id)))
    const userMap = userIds.length > 0
      ? Object.fromEntries(
          (await db.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          })).map((u) => [u.id, u.name])
        )
      : {}

    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id,
        billingMonth: r.billingMonth,
        billingYear: r.billingYear,
        triggerType: r.triggerType,
        triggeredBy: r.triggeredBy,
        triggeredByName: r.triggeredBy ? userMap[r.triggeredBy] || null : null,
        status: r.status,
        totalStudents: r.totalStudents,
        successCount: r.successCount,
        skippedCount: r.skippedCount,
        failedCount: r.failedCount,
        totalAmount: r.totalAmount,
        filters: r.filters ? JSON.parse(r.filters) : null,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
      })),
    })
  } catch (error) {
    console.error('List demand runs error:', error)
    return internalError('loading demand-slip run history')
  }
}
