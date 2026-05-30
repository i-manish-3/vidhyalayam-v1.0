/**
 * POST /api/school/students/[id]/refunds — issue a cash refund
 * GET  /api/school/students/[id]/refunds — list refunds for a student
 *
 * Refunds are issued against an existing StudentWithdrawal that carries a
 * non-zero `totalRefundDue` (set when the withdraw flow detected paid items
 * in the cancelled future window). A withdrawal can have multiple partial
 * refunds; outstanding obligation = totalRefundDue − sum(active refunds).
 *
 * RBAC: POST requires `fees:refund`, GET requires `fees:read`. Both honour
 * tenant scoping by schoolId.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { issueRefund, RefundValidationError } from '@/lib/refunds'

const VALID_PAYMENT_METHODS = ['cash'] as const
type ValidPaymentMethod = (typeof VALID_PAYMENT_METHODS)[number]

function mapRefundError(err: RefundValidationError) {
  switch (err.code) {
    case 'WITHDRAWAL_NOT_FOUND':
    case 'REFUND_NOT_FOUND':
      return apiError(404, err.message)
    case 'WITHDRAWAL_REVERSED':
    case 'REFUND_ALREADY_VOIDED':
      return apiError(409, err.message)
    case 'AMOUNT_INVALID':
    case 'AMOUNT_EXCEEDS_OUTSTANDING':
    default:
      return apiError(400, err.message)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'fees:refund')
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: studentId } = await params
    const body = await request.json().catch(() => ({}))

    const withdrawalId = typeof body.withdrawalId === 'string' ? body.withdrawalId.trim() : ''
    if (!withdrawalId) {
      return apiError(400, 'withdrawalId is required')
    }

    const amountRaw = body.amount
    const amount =
      typeof amountRaw === 'number'
        ? amountRaw
        : typeof amountRaw === 'string'
          ? Number(amountRaw)
          : NaN
    if (!Number.isFinite(amount) || amount <= 0) {
      return apiError(400, 'amount must be a positive number')
    }

    const paymentMethodRaw =
      typeof body.paymentMethod === 'string' ? body.paymentMethod.trim().toLowerCase() : 'cash'
    const paymentMethod: ValidPaymentMethod = VALID_PAYMENT_METHODS.includes(
      paymentMethodRaw as ValidPaymentMethod,
    )
      ? (paymentMethodRaw as ValidPaymentMethod)
      : 'cash'

    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

    // Tenant-scoped student check before opening the transaction.
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found')

    const result = await db.$transaction(async (tx) => {
      return issueRefund({
        tx,
        schoolId: user.schoolId!,
        studentId,
        withdrawalId,
        amount,
        paymentMethod,
        notes,
        performedBy: user.userId,
      })
    })

    return NextResponse.json({
      success: true,
      refund: result.refund,
      receiptNumber: result.receiptNumber,
      ledgerEntryId: result.ledgerEntryId,
    })
  } catch (error) {
    if (error instanceof RefundValidationError) {
      return mapRefundError(error)
    }
    console.error('POST /students/[id]/refunds failed:', error)
    return internalError('Failed to issue refund')
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'fees:read')
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: studentId } = await params

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found')

    const url = new URL(request.url)
    const withdrawalId = url.searchParams.get('withdrawalId')

    const refunds = await db.studentFeeRefund.findMany({
      where: {
        schoolId: user.schoolId,
        studentId,
        deletedAt: null,
        ...(withdrawalId ? { withdrawalId } : {}),
      },
      orderBy: { issuedDate: 'desc' },
    })

    return NextResponse.json({ success: true, refunds })
  } catch (error) {
    console.error('GET /students/[id]/refunds failed:', error)
    return internalError('Failed to load refunds')
  }
}
