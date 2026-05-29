import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { forbiddenError, internalError, unauthorizedError } from '@/lib/api-errors'

function cleanInt(value: unknown, min: number, max: number): number | null {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) return null
  return n
}

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const ok = await requirePermission(request, 'fees:read')
      if (!ok) return forbiddenError("You don't have permission to view notifications.")
    }

    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoiceId') || undefined
    const month = cleanInt(searchParams.get('month'), 1, 12)
    const year = cleanInt(searchParams.get('year'), 2020, 2100)

    const where: Prisma.FeeNotificationWhereInput = {
      schoolId: user.schoolId,
      channel: 'WHATSAPP',
    }
    if (invoiceId) where.invoiceId = invoiceId
    if (month && year) {
      where.invoice = { billingMonth: month, billingYear: year }
    }

    const [rows, summary] = await Promise.all([
      db.feeNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          invoiceId: true,
          studentId: true,
          recipient: true,
          status: true,
          providerMsgId: true,
          errorMessage: true,
          sentAt: true,
          createdAt: true,
        },
      }),
      db.feeNotification.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
    ])

    const counts = { pending: 0, sending: 0, sent: 0, failed: 0 }
    for (const row of summary) {
      const k = row.status as keyof typeof counts
      if (k in counts) counts[k] = row._count._all
    }

    return NextResponse.json({
      notifications: rows,
      summary: {
        pending: counts.pending,
        sending: counts.sending,
        sent: counts.sent,
        failed: counts.failed,
        total: counts.pending + counts.sending + counts.sent + counts.failed,
      },
    })
  } catch (error) {
    console.error('List notifications error:', error)
    return internalError('loading notifications')
  }
}
