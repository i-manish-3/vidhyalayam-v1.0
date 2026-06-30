import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'
import { extractAuditContext, logFeeTransaction } from '@/lib/audit'
import { cancelStudentLedgerPayment, FeePaymentCancellationError } from '@/lib/fees'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'fees:refund')
    if (!user?.schoolId) {
      return apiError(403, "You don't have permission to cancel fee payments.")
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (reason.length < 5) {
      return apiError(400, 'Please enter a cancellation reason of at least 5 characters.')
    }
    if (reason.length > 500) {
      return apiError(400, 'Cancellation reason cannot exceed 500 characters.')
    }

    const auditContext = extractAuditContext(request, user.userId)
    const result = await db.$transaction(async (tx) => {
      const cancellation = await cancelStudentLedgerPayment({
        tx,
        schoolId: user.schoolId!,
        creditEntryId: id,
        reason,
        cancelledBy: user.userId,
      })

      await logFeeTransaction(
        tx,
        user.schoolId!,
        'StudentFeePayment',
        cancellation.receiptNumber,
        'payment_cancelled',
        cancellation.previousPayment,
        cancellation.payment,
        {
          ...auditContext,
          metadata: {
            studentId: cancellation.payment.studentId,
            receiptNumber: cancellation.receiptNumber,
            cancelledAmount: cancellation.cancelledAmount,
            cancellationReason: reason,
            reopenedDebitCount: cancellation.reopenedDebitCount,
          },
        },
      )

      return cancellation
    })

    return NextResponse.json({
      success: true,
      receiptNumber: result.receiptNumber,
      cancelledAmount: result.cancelledAmount,
      reopenedDebitCount: result.reopenedDebitCount,
      message: `Receipt ${result.receiptNumber} has been cancelled and the fee balance has been restored.`,
    })
  } catch (error) {
    if (error instanceof FeePaymentCancellationError) {
      const status = error.code === 'PAYMENT_NOT_FOUND' ? 404 : 409
      return apiError(status, error.message)
    }
    console.error('Cancel fee payment error:', error)
    return internalError('cancelling the fee payment')
  }
}
