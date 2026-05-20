import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { apiError, internalError, notFoundError, unauthorizedError } from '@/lib/api-errors'

// PATCH /api/school/fees/invoices/[id] - Lock/unlock/cancel an invoice.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params
    const body = await request.json()
    const action = typeof body.action === 'string' ? body.action : ''

    const invoice = await db.studentFeeInvoice.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: { collections: { where: { deletedAt: null } } },
    })
    if (!invoice) {
      return notFoundError('StudentFeeInvoice')
    }

    if (action === 'lock') {
      const updated = await db.studentFeeInvoice.update({
        where: { id },
        data: { lockedAt: new Date(), lockedBy: user.userId },
      })
      await db.feeAuditLog.create({
        data: {
          schoolId: user.schoolId,
          entityType: 'StudentFeeInvoice',
          entityId: id,
          action: 'locked',
          changedBy: user.userId,
        },
      })
      return NextResponse.json({ invoice: updated })
    }

    if (action === 'unlock') {
      const updated = await db.studentFeeInvoice.update({
        where: { id },
        data: { lockedAt: null, lockedBy: null },
      })
      await db.feeAuditLog.create({
        data: {
          schoolId: user.schoolId,
          entityType: 'StudentFeeInvoice',
          entityId: id,
          action: 'unlocked',
          changedBy: user.userId,
        },
      })
      return NextResponse.json({ invoice: updated })
    }

    if (action === 'cancel') {
      if (invoice.paidAmount > 0) {
        return apiError(400, 'Paid invoices cannot be cancelled. Create an adjustment or refund instead.')
      }

      const updated = await db.$transaction(async (tx) => {
        await tx.feeCollection.updateMany({
          where: { studentFeeInvoiceId: id, schoolId: user.schoolId!, deletedAt: null },
          data: { paymentStatus: 'cancelled' },
        })
        await tx.studentFeeLedgerEntry.updateMany({
          where: { invoiceId: id, schoolId: user.schoolId!, entryType: 'DEBIT', deletedAt: null },
          data: { status: 'cancelled', balanceAmount: 0 },
        })
        await tx.studentFeeInvoiceLine.updateMany({
          where: { invoiceId: id },
          data: { status: 'cancelled' },
        })
        const cancelled = await tx.studentFeeInvoice.update({
          where: { id },
          data: { status: 'cancelled', lockedAt: new Date(), lockedBy: user.userId },
        })
        await tx.feeAuditLog.create({
          data: {
            schoolId: user.schoolId!,
            entityType: 'StudentFeeInvoice',
            entityId: id,
            action: 'cancelled',
            changedBy: user.userId,
          },
        })
        return cancelled
      })
      return NextResponse.json({ invoice: updated })
    }

    return apiError(400, 'Unsupported invoice action.')
  } catch (error) {
    console.error('Update fee invoice error:', error)
    return internalError('updating fee invoice')
  }
}
