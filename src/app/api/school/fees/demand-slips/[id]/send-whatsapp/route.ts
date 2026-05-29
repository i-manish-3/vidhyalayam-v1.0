import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, forbiddenError, internalError, notFoundError, unauthorizedError } from '@/lib/api-errors'
import { sendSlipViaWhatsApp } from '@/lib/whatsapp/send-slip'

const RECENT_WINDOW_MS = 60 * 60 * 1000 // 1 hour idempotency window

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const ok = await requirePermission(request, 'fees:create')
      if (!ok) return forbiddenError("You don't have permission to send demand slips.")
    }

    const { id } = await params

    const slip = await db.studentFeeInvoice.findFirst({
      where: { id, schoolId: user.schoolId, isMonthlyDemand: true, deletedAt: null },
      select: { id: true },
    })
    if (!slip) return notFoundError('Demand slip')

    let force = false
    try {
      const body = await request.json()
      force = body?.force === true
    } catch { /* empty body is fine */ }

    if (!force) {
      const recent = await db.feeNotification.findFirst({
        where: {
          invoiceId: id,
          channel: 'WHATSAPP',
          status: { in: ['sent', 'pending', 'sending'] },
          createdAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) },
        },
      })
      if (recent) {
        return apiError(409, 'A WhatsApp send for this slip is already in progress or was sent in the last hour. Set force=true to resend.')
      }
    }

    const notification = await sendSlipViaWhatsApp({
      schoolId: user.schoolId,
      invoiceId: id,
      triggeredBy: user.userId,
    })

    return NextResponse.json({ notification })
  } catch (error) {
    console.error('Send WhatsApp error:', error)
    const message = error instanceof Error ? error.message : 'Failed to send'
    return apiError(500, message)
  }
}
