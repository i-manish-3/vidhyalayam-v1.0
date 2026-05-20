import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { apiError, internalError, notFoundError, unauthorizedError } from '@/lib/api-errors'
import { createFeeDebitLedgerEntry, generateReceiptNumber, recordStudentLedgerPayment } from '@/lib/fees'

// POST /api/school/fees/invoices/[id]/payments - Record payment against an invoice and allocate to open demand rows.
export async function POST(
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
    const amount = Number(body.amount || 0)
    const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod : 'CASH'
    const transactionRef = typeof body.transactionRef === 'string' ? body.transactionRef.trim() : null
    const notes = typeof body.notes === 'string' ? body.notes.trim() : null

    if (!Number.isFinite(amount) || amount <= 0) {
      return apiError(400, 'Please enter a valid payment amount.')
    }

    const result = await db.$transaction(async (tx) => {
      const invoice = await tx.studentFeeInvoice.findFirst({
        where: { id, schoolId: user.schoolId!, deletedAt: null },
        include: {
          collections: {
            where: { deletedAt: null, paymentStatus: { in: ['unpaid', 'partial'] } },
            orderBy: { createdAt: 'asc' },
          },
        },
      })

      if (!invoice) {
        throw new Error('NOT_FOUND')
      }
      if (invoice.status === 'cancelled') {
        throw new Error('CANCELLED')
      }

      const balance = Math.max(invoice.totalAmount - invoice.paidAmount, 0)
      if (balance <= 0) {
        throw new Error('PAID')
      }

      const receipt = generateReceiptNumber()
      const paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date()

      for (const collection of invoice.collections) {
        const existingLedgerDebit = await tx.studentFeeLedgerEntry.findFirst({
          where: {
            schoolId: user.schoolId!,
            studentId: invoice.studentId,
            entryType: 'DEBIT',
            deletedAt: null,
            OR: [
              { feeCollectionId: collection.id },
              ...(collection.studentFeeAssignmentItemId ? [{ assignmentItemId: collection.studentFeeAssignmentItemId }] : []),
            ],
          },
        })
        if (existingLedgerDebit) continue

        const totalDebit = collection.amount + collection.fine
        const carriedBalance = Math.max(
          0,
          totalDebit - collection.paidAmount - collection.discount - collection.concession - collection.scholarship
        )
        const debit = await createFeeDebitLedgerEntry({
          tx,
          schoolId: user.schoolId!,
          studentId: invoice.studentId,
          assignmentItemId: collection.studentFeeAssignmentItemId,
          invoiceId: id,
          feeCollectionId: collection.id,
          sourceType: 'migration',
          sourceId: collection.id,
          feeHeadName: collection.feeHeadName || 'Fee',
          installmentName: collection.installmentName,
          description: `${collection.feeHeadName || 'Fee'}${collection.installmentName ? ` - ${collection.installmentName}` : ''}`,
          amount: totalDebit,
          dueDate: collection.dueDate,
          transactionDate: collection.createdAt,
          notes: collection.notes,
          createdBy: user.userId,
        })
        if (debit) {
          await tx.studentFeeLedgerEntry.update({
            where: { id: debit.id },
            data: {
              balanceAmount: carriedBalance,
              status: carriedBalance <= 0 ? 'settled' : carriedBalance < totalDebit ? 'partial' : 'open',
            },
          })
        }
      }

      const paymentResult = await recordStudentLedgerPayment({
        tx,
        schoolId: user.schoolId!,
        studentId: invoice.studentId,
        amount: Math.min(amount, balance),
        paymentMethod,
        transactionRef,
        receiptNumber: receipt,
        paymentDate,
        notes,
        receivedBy: user.userId,
        invoiceId: id,
      })

      const updatedInvoice = await tx.studentFeeInvoice.findUnique({
        where: { id },
      })

      await tx.feeAuditLog.create({
        data: {
          schoolId: user.schoolId!,
          entityType: 'StudentFeeInvoice',
          entityId: id,
          action: 'payment_recorded',
          changedBy: user.userId,
          newValue: JSON.stringify({ amount: paymentResult.appliedAmount, receiptNumber: receipt, paymentMethod }),
        },
      })

      return { invoice: updatedInvoice, payment: paymentResult.payment }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return notFoundError('StudentFeeInvoice')
    }
    if (error instanceof Error && error.message === 'CANCELLED') {
      return apiError(400, 'Cancelled invoices cannot receive payments.')
    }
    if (error instanceof Error && error.message === 'PAID') {
      return apiError(400, 'This invoice is already paid.')
    }
    console.error('Record invoice payment error:', error)
    return internalError('recording invoice payment')
  }
}
