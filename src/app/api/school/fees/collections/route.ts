import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import {
  createFeeDebitLedgerEntry,
  nextSequentialReceiptNumber,
  recordStudentLedgerPayment,
  recordStudentLedgerWaiver,
} from '@/lib/fees'
import { logFeeTransaction, extractAuditContext } from '@/lib/audit'
import { notificationService } from '@/lib/notifications'
import {
  encodeNotesTail,
  decodeNotesTail,
  type RecordedPaymentSplit,
  type PersistedSlipLine,
} from '@/lib/fee-notes-tail'

// Retry configuration for concurrent payment scenarios
const PAYMENT_RETRY_ATTEMPTS = 3
const PAYMENT_RETRY_DELAY_MS = 100

// Fire a FEE_SUBMITTED notification to the student's guardians. Fully isolated:
// never throws, never blocks the payment response in a meaningful way (the
// in-app write is fast; external channels are enqueued).
async function notifyFeeSubmittedSafe(
  schoolId: string,
  studentId: string,
  receiptNo: string,
  amount: number,
  createdBy: string,
): Promise<void> {
  try {
    await notificationService.triggerEvent({
      schoolId,
      eventType: 'FEE_SUBMITTED',
      studentId,
      createdBy,
      metadata: {
        amount: amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        receiptNo,
      },
    })
  } catch (err) {
    console.error('[notif] FEE_SUBMITTED trigger failed:', err instanceof Error ? err.message : err)
  }
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 = Unique constraint violation (e.g., duplicate receipt number)
    if (error.code === 'P2002') return true
  }
  if (error instanceof Error) {
    // Concurrent modification error from optimistic locking
    if (error.message.includes('Concurrent modification detected')) return true
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function ledgerStatus(balance: number, amount: number) {
  if (balance <= 0) return 'PAID'
  if (balance < amount) return 'PARTIAL'
  return 'UNPAID'
}

function periodSortIndex(period?: string | null) {
  const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
  const index = months.findIndex((month) => month.toLowerCase() === (period || '').toLowerCase())
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function sortPeriods(periods: string[]) {
  return [...periods].sort((a, b) => {
    const indexCompare = periodSortIndex(a) - periodSortIndex(b)
    return indexCompare || a.localeCompare(b)
  })
}

function stripReceiptPrefix(value?: string | null) {
  return (value || '-').replace(/^RCP-/, '')
}

function extractAcademicYear(value?: string | null) {
  return value?.match(/\d{4}-\d{4}/)?.[0] || null
}

// Notes-tail encode/decode + the SLIP/SPLITS delimiters and snapshot types now
// live in `@/lib/fee-notes-tail` so the parent receipt renderer can decode the
// same persisted slip snapshot. Imported above.

function sanitizeIncomingSplits(value: unknown): RecordedPaymentSplit[] | null {
  if (!Array.isArray(value)) return null
  const cleaned: RecordedPaymentSplit[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const obj = raw as Record<string, unknown>
    const method = typeof obj.paymentMethod === 'string' ? obj.paymentMethod.trim() : ''
    const amount = Number(obj.amount)
    if (!method || !Number.isFinite(amount) || amount <= 0) continue
    cleaned.push({
      paymentMethod: method,
      amount: roundMoney(amount),
      transactionRef: typeof obj.transactionRef === 'string' && obj.transactionRef.trim() ? obj.transactionRef.trim() : null,
      remarks: typeof obj.remarks === 'string' && obj.remarks.trim() ? obj.remarks.trim() : null,
    })
  }
  return cleaned.length > 0 ? cleaned : null
}

function sanitizeIncomingSlipLines(value: unknown): PersistedSlipLine[] | null {
  if (!Array.isArray(value)) return null
  const cleaned: PersistedSlipLine[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const obj = raw as Record<string, unknown>
    const headName = typeof obj.feeHeadName === 'string' ? obj.feeHeadName.trim() : ''
    if (!headName) continue
    cleaned.push({
      feeHeadName: headName,
      installmentName: typeof obj.installmentName === 'string' && obj.installmentName.trim() ? obj.installmentName.trim() : null,
      academicYear: typeof obj.academicYear === 'string' && obj.academicYear.trim() ? obj.academicYear.trim() : null,
      isTransport: !!obj.isTransport,
      dueDate: typeof obj.dueDate === 'string' && obj.dueDate.trim() ? obj.dueDate.trim() : null,
      paid: roundMoney(Number(obj.paid) || 0),
      due: roundMoney(Number(obj.due) || 0),
    })
  }
  return cleaned.length > 0 ? cleaned : null
}

async function ensureLedgerForExistingCollections(
  schoolId: string,
  studentId?: string,
  academicYear?: string
) {
  const collections = await db.feeCollection.findMany({
    where: {
      schoolId,
      deletedAt: null,
      ...(studentId ? { studentId } : {}),
      ledgerEntries: { none: { entryType: 'DEBIT', deletedAt: null } },
      ...(academicYear
        ? {
            OR: [
              { assignmentItem: { assignment: { academicYear } } },
              { notes: { contains: academicYear } },
            ],
          }
        : {}),
    },
    include: {
      assignmentItem: {
        include: {
          assignment: { select: { id: true, academicYear: true } },
          invoiceLines: { select: { id: true, invoiceId: true }, take: 1 },
        },
      },
    },
    take: 500,
  })

  if (collections.length === 0) return

  await db.$transaction(async (tx) => {
    for (const collection of collections) {
      const invoiceLine = collection.assignmentItem?.invoiceLines[0]
      const collectionAcademicYear = collection.assignmentItem?.assignment?.academicYear || extractAcademicYear(collection.notes)
      const totalDebit = roundMoney(collection.amount + collection.fine)
      const carriedBalance = roundMoney(Math.max(
        0,
        totalDebit - collection.paidAmount - collection.discount - collection.concession - collection.scholarship
      ))
      const debit = await createFeeDebitLedgerEntry({
        tx,
        schoolId,
        studentId: collection.studentId,
        academicYear: collectionAcademicYear,
        assignmentId: collection.assignmentItem?.assignment?.id,
        assignmentItemId: collection.studentFeeAssignmentItemId,
        invoiceId: collection.studentFeeInvoiceId || invoiceLine?.invoiceId,
        invoiceLineId: invoiceLine?.id,
        feeCollectionId: collection.id,
        sourceType: collection.feeHeadName?.toLowerCase().includes('transport') ? 'transport' : 'migration',
        sourceId: collection.id,
        feeHeadName: collection.feeHeadName || 'Fee',
        installmentName: collection.installmentName,
        description: `${collection.feeHeadName || 'Fee'}${collection.installmentName ? ` - ${collection.installmentName}` : ''}`,
        amount: totalDebit,
        dueDate: collection.dueDate,
        transactionDate: collection.createdAt,
        notes: collection.notes,
      })

      if (!debit) continue

      await tx.studentFeeLedgerEntry.update({
        where: { id: debit.id },
        data: {
          balanceAmount: carriedBalance,
          status: carriedBalance <= 0 ? 'settled' : carriedBalance < totalDebit ? 'partial' : 'open',
          receiptNumber: collection.receiptNumber,
          paymentMethod: collection.paymentMethod,
          transactionRef: collection.transactionRef,
        },
      })
    }
  })
}

// GET /api/school/fees/collections - List ledger-backed fee dues.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || ''
    const paymentStatus = searchParams.get('paymentStatus') || ''
    const academicYear = searchParams.get('academicYear') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    await ensureLedgerForExistingCollections(user.schoolId, studentId || undefined, academicYear || undefined)

    const where: Prisma.StudentFeeLedgerEntryWhereInput = {
      schoolId: user.schoolId,
      entryType: 'DEBIT',
      deletedAt: null,
      ...(studentId ? { studentId } : {}),
      ...(academicYear ? { academicYear } : {}),
    }
    if (paymentStatus) {
      const status = paymentStatus.toLowerCase()
      if (status === 'paid') {
        where.status = 'settled'
      } else if (status === 'unpaid' || status === 'pending') {
        where.status = { in: ['open', 'partial'] }
      } else {
        where.status = status
      }
    }

    const [entries, total, credits, transportAllocation] = await Promise.all([
      db.studentFeeLedgerEntry.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              rollNumber: true,
              class: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
          assignment: {
            include: {
              feesGroup: { select: { id: true, name: true } },
            },
          },
          feeCollection: true,
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: limit,
      }),
      db.studentFeeLedgerEntry.count({ where }),
      studentId
        ? db.studentFeeLedgerEntry.findMany({
            where: {
              schoolId: user.schoolId,
              studentId,
              entryType: 'CREDIT',
              deletedAt: null,
              receiptNumber: { not: null },
            },
            include: {
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  rollNumber: true,
                  class: { select: { name: true } },
                  section: { select: { name: true } },
                },
              },
              creditAllocations: {
                where: { deletedAt: null },
                include: {
                  debitEntry: {
                    include: {
                      feeCollection: true,
                      debitAllocations: {
                        where: { deletedAt: null },
                        include: {
                          creditEntry: {
                            select: { id: true, transactionDate: true, createdAt: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
            take: 100,
          })
        : Promise.resolve([]),
      studentId
        ? db.transportAllocation.findFirst({
            where: {
              schoolId: user.schoolId,
              studentId,
              isActive: true,
              ...(academicYear ? { academicYear } : {}),
            },
            include: {
              route: {
                select: {
                  id: true,
                  routeName: true,
                  routeNumber: true,
                  startPoint: true,
                  endPoint: true,
                  vehicleNumber: true,
                },
              },
            },
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve(null),
    ])

    const normalizedCollections = entries.map((entry) => {
      const paidAmount = entry.feeCollection
        ? entry.feeCollection.paidAmount
        : roundMoney(entry.debit - entry.balanceAmount)
      const source = (entry.feeHeadName || '').toLowerCase().includes('transport') || entry.sourceType === 'transport'
        ? 'transport'
        : 'fees'

      return {
        id: entry.feeCollectionId || entry.id,
        ledgerEntryId: entry.id,
        studentId: entry.studentId,
        student: entry.student,
        studentFeeAssignmentItemId: entry.assignmentItemId,
        studentFeeInvoiceId: entry.invoiceId,
        feeHeadName: entry.feeHeadName,
        installment: entry.installmentName,
        installmentName: entry.installmentName,
        amount: entry.feeCollection?.amount ?? entry.debit,
        paidAmount,
        balanceAmount: entry.balanceAmount,
        status: ledgerStatus(entry.balanceAmount, entry.debit),
        paymentStatus: ledgerStatus(entry.balanceAmount, entry.debit).toLowerCase(),
        paymentDate: entry.feeCollection?.paymentDate,
        dueDate: entry.dueDate,
        lateFee: entry.feeCollection?.fine || 0,
        fine: entry.feeCollection?.fine || 0,
        discount: entry.feeCollection?.discount || 0,
        concession: entry.feeCollection?.concession || 0,
        scholarship: entry.feeCollection?.scholarship || 0,
        paymentMethod: entry.feeCollection?.paymentMethod || entry.paymentMethod,
        notes: entry.notes || entry.feeCollection?.notes,
        receiptNumber: entry.feeCollection?.receiptNumber || entry.receiptNumber,
        academicYear: entry.academicYear,
        feesGroupId: entry.assignment?.feesGroupId || null,
        feesGroupName: entry.assignment?.feesGroup?.name || null,
        source,
      }
    })

    // Resolve cashier display names in a single batched query — the credits
    // table only stores the userId. Restricting to this school keeps tenant
    // boundaries clean even if a stale `createdBy` somehow points at a user
    // from another school.
    const collectorIds = Array.from(
      new Set(
        credits
          .map((credit) => credit.createdBy)
          .filter((id): id is string => !!id)
      )
    )
    const collectorMap = new Map<string, { id: string; name: string }>()
    if (collectorIds.length > 0) {
      const collectorRows = await db.user.findMany({
        where: { id: { in: collectorIds }, schoolId: user.schoolId },
        select: { id: true, name: true, email: true },
      })
      for (const row of collectorRows) {
        collectorMap.set(row.id, { id: row.id, name: row.name || row.email || 'Unknown' })
      }
    }

    const receiptHistory = credits.map((credit) => {
      const feePeriods = new Set<string>()
      const transportPeriods = new Set<string>()
      const hostelPeriods = new Set<string>()
      const sessions = new Set<string>()
      let discount = 0
      let dues = 0

      // Per-allocation breakdown for the "View" slip in the history table.
      // One entry per debit that this credit touched — paid amount in this
      // receipt + the debit's balance *after* this receipt (current balance
      // plus any allocations from later credits added back).
      const lines: Array<{
        feeHeadName: string
        installmentName: string | null
        academicYear: string | null
        isTransport: boolean
        dueDate: Date | null
        paidInReceipt: number
        balanceAfter: number
      }> = []

      for (const allocation of credit.creditAllocations) {
        const debit = allocation.debitEntry
        const period = debit.installmentName || debit.feeCollection?.installmentName || ''
        const headName = (debit.feeHeadName || debit.feeCollection?.feeHeadName || '').toLowerCase()
        if (period) {
          if (headName.includes('transport')) {
            transportPeriods.add(period)
          } else if (headName.includes('hostel')) {
            hostelPeriods.add(period)
          } else {
            feePeriods.add(period)
          }
        }
        if (debit.academicYear) sessions.add(debit.academicYear)
        discount += (debit.feeCollection?.discount || 0) + (debit.feeCollection?.concession || 0) + (debit.feeCollection?.scholarship || 0)
        const laterAllocated = debit.debitAllocations
          .filter((other) => {
            if (other.creditEntryId === credit.id) return false
            const otherTime = other.creditEntry?.transactionDate || other.allocatedAt || other.createdAt
            const currentTime = credit.transactionDate
            if (otherTime.getTime() !== currentTime.getTime()) return otherTime > currentTime
            return other.createdAt > allocation.createdAt
          })
          .reduce((sum, other) => sum + other.amount, 0)
        const balanceAfter = roundMoney(debit.balanceAmount + laterAllocated)
        dues += debit.balanceAmount + laterAllocated

        lines.push({
          feeHeadName: debit.feeHeadName || debit.feeCollection?.feeHeadName || 'Fee',
          installmentName: debit.installmentName || debit.feeCollection?.installmentName || null,
          academicYear: debit.academicYear || null,
          isTransport: headName.includes('transport'),
          dueDate: debit.dueDate || debit.feeCollection?.dueDate || null,
          paidInReceipt: roundMoney(allocation.amount),
          balanceAfter,
        })
      }

      const { notes: cleanNotes, splits, slipLines: persistedSlipLines } = decodeNotesTail(credit.notes)
      const collectedBy = credit.createdBy ? (collectorMap.get(credit.createdBy) || null) : null

      // Prefer the persisted slip snapshot when present — it captures the
      // exact slip the cashier saw, including ticked items that received
      // zero allocation (so this receipt's Dues stays self-consistent over
      // time, even when later receipts settle the residue).
      // Falls back to allocation-derived lines for receipts written before
      // the snapshot tail was added.
      const usePersisted = persistedSlipLines && persistedSlipLines.length > 0
      const responseLines = usePersisted
        ? persistedSlipLines!.map((l) => ({
            feeHeadName: l.feeHeadName,
            installmentName: l.installmentName,
            academicYear: l.academicYear,
            isTransport: l.isTransport,
            dueDate: l.dueDate ? new Date(l.dueDate) : null,
            paidInReceipt: l.paid,
            balanceAfter: l.due,
          }))
        : lines
      const responseDues = usePersisted
        ? roundMoney(persistedSlipLines!.reduce((sum, l) => sum + (l.due || 0), 0))
        : roundMoney(dues)

      return {
        id: credit.id,
        receiptNumber: stripReceiptPrefix(credit.receiptNumber),
        studentName: credit.student ? `${credit.student.firstName} ${credit.student.lastName}`.trim() : '-',
        className: credit.student?.class?.name || '-',
        feeMonth: sortPeriods(Array.from(feePeriods)).join(', '),
        transportMonth: sortPeriods(Array.from(transportPeriods)).join(', '),
        hostelMonth: sortPeriods(Array.from(hostelPeriods)).join(', '),
        // `date` = business payment date the cashier picked (used for the
        //   printed receipt header and for receipt-relative slip bucketing).
        // `submittedAt` = wall-clock moment the record was actually written
        //   to the DB — what the cashier wants to see in the history table.
        date: credit.transactionDate,
        submittedAt: credit.createdAt,
        discount: roundMoney(discount),
        paid: credit.credit,
        dues: responseDues,
        paymentMethod: credit.paymentMethod,
        notes: cleanNotes,
        splits,
        collectedBy,
        session: Array.from(sessions).sort().join(', ') || academicYear || null,
        receiptId: credit.receiptNumber,
        lines: responseLines,
      }
    })

    return NextResponse.json({
      collections: normalizedCollections,
      receiptHistory,
      transportInfo: transportAllocation
        ? {
            id: transportAllocation.id,
            routeId: transportAllocation.routeId,
            routeName: transportAllocation.route.routeName,
            routeNumber: transportAllocation.route.routeNumber,
            startPoint: transportAllocation.route.startPoint,
            endPoint: transportAllocation.route.endPoint,
            vehicleNumber: transportAllocation.route.vehicleNumber,
            stopName: transportAllocation.stopName || transportAllocation.pickupPoint || transportAllocation.dropPoint,
            pickupPoint: transportAllocation.pickupPoint,
            dropPoint: transportAllocation.dropPoint,
            fareAmount: transportAllocation.fareAmount,
            academicYear: transportAllocation.academicYear,
          }
        : null,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List fee collections error:', error)
    return internalError('listing fee collections')
  }
}

// POST /api/school/fees/collections - Record fee payment against ledger dues.
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'fees:collect')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to record fee payments.")
    }

    const body = await request.json()
    const {
      payments,
      collectionId,
      ledgerEntryId,
      studentId,
      amount,
      paidAmount,
      discount,
      concession,
      scholarship,
      paymentMethod,
      transactionRef,
      paymentDate,
      receiptNumber,
      notes,
      splits: rawSplits,
      slipLines: rawSlipLines,
    } = body

    const sanitizedSplits = sanitizeIncomingSplits(rawSplits)
    const sanitizedSlipLines = sanitizeIncomingSlipLines(rawSlipLines)
    const notesWithSplits = encodeNotesTail(notes, sanitizedSlipLines, sanitizedSplits)

    if (!studentId) {
      return apiError(400, 'Please select a student.')
    }

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!student) {
      return apiError(404, 'We couldn\'t find this student\'s record. They may have been removed.')
    }

    await ensureLedgerForExistingCollections(user.schoolId, studentId)

    const paymentDateValue = paymentDate ? new Date(paymentDate) : new Date()

    if (Array.isArray(payments)) {
      if (payments.length === 0) {
        return apiError(400, 'Please select at least one fee particular.')
      }

      // Retry wrapper for concurrent payment scenarios
      let lastError: unknown = null
      for (let attempt = 0; attempt < PAYMENT_RETRY_ATTEMPTS; attempt++) {
        try {
          const result = await db.$transaction(async (tx) => {
            const generatedReceipt = receiptNumber || (await nextSequentialReceiptNumber(tx, user.schoolId!))
            const targets = payments
              .map((payment: { ledgerEntryId?: string; collectionId?: string; id?: string; amount?: number; paidAmount?: number }) => ({
                debitEntryId: payment.ledgerEntryId || null,
                feeCollectionId: payment.collectionId || payment.id || null,
                amount: Number(payment.paidAmount ?? payment.amount ?? 0),
              }))
              .filter((target: { amount: number; debitEntryId: string | null; feeCollectionId: string | null }) =>
                target.amount > 0 && (target.debitEntryId || target.feeCollectionId)
              )

            const totalPaid = roundMoney(targets.reduce((sum: number, target: { amount: number }) => sum + target.amount, 0))
            const totalDiscount = roundMoney(payments.reduce((sum: number, payment: { discount?: number }) => sum + Number(payment.discount || 0), 0))
            const discountTargets = payments
              .map((payment: { ledgerEntryId?: string; collectionId?: string; id?: string; discount?: number }) => ({
                debitEntryId: payment.ledgerEntryId || null,
                feeCollectionId: payment.collectionId || payment.id || null,
                amount: Number(payment.discount || 0),
              }))
              .filter((target: { amount: number; debitEntryId: string | null; feeCollectionId: string | null }) =>
                target.amount > 0 && (target.debitEntryId || target.feeCollectionId)
              )

            const paymentResult = totalPaid > 0
              ? await recordStudentLedgerPayment({
                  tx,
                  schoolId: user.schoolId!,
                  studentId,
                  amount: totalPaid,
                  paymentMethod: paymentMethod || 'CASH',
                  transactionRef,
                  receiptNumber: generatedReceipt,
                  paymentDate: paymentDateValue,
                  notes: notesWithSplits,
                  receivedBy: user.userId,
                  targets,
                })
              : null

            if (totalDiscount > 0) {
              await recordStudentLedgerWaiver({
                tx,
                schoolId: user.schoolId!,
                studentId,
                amount: totalDiscount,
                sourceType: 'discount',
                receiptNumber: generatedReceipt,
                paymentDate: paymentDateValue,
                notes: notesWithSplits,
                createdBy: user.userId,
                targets: discountTargets,
              })
            }

            // Enhanced audit logging with snapshots
            const auditContext = extractAuditContext(request, user.userId)
            await logFeeTransaction(
              tx,
              user.schoolId!,
              'StudentFeePayment',
              generatedReceipt,
              'payment_recorded',
              null, // No old value for new payment
              {
                studentId,
                receiptNumber: generatedReceipt,
                amount: totalPaid,
                paymentMethod,
                paymentDate: paymentDateValue,
                receivedBy: user.userId,
              },
              {
                ...auditContext,
                metadata: {
                  totalPaid,
                  totalDiscount,
                  rowCount: payments.length,
                  splits: sanitizedSplits,
                  slipLineCount: sanitizedSlipLines?.length || 0,
                },
              }
            )

            return {
              receiptNumber: generatedReceipt,
              payment: paymentResult?.payment || null,
              appliedAmount: paymentResult?.appliedAmount || 0,
            }
          })

          await notifyFeeSubmittedSafe(user.schoolId!, studentId, result.receiptNumber, result.appliedAmount, user.userId)
          return NextResponse.json(result, { status: 201 })
        } catch (error) {
          lastError = error

          if (!isRetryableError(error)) {
            // Non-retryable error, throw immediately
            throw error
          }

          // Last attempt failed, throw the error
          if (attempt === PAYMENT_RETRY_ATTEMPTS - 1) {
            throw error
          }

          // Wait before retrying with exponential backoff
          const delay = PAYMENT_RETRY_DELAY_MS * Math.pow(2, attempt)
          await sleep(delay)
        }
      }

      throw lastError instanceof Error ? lastError : new Error('Payment recording failed after retries')
    }

    const paymentAmount = roundMoney(Number(paidAmount ?? amount ?? 0))
    const discountAmount = roundMoney(Number(discount || 0))
    const concessionAmount = roundMoney(Number(concession || 0))
    const scholarshipAmount = roundMoney(Number(scholarship || 0))
    const adjustmentAmount = roundMoney(discountAmount + concessionAmount + scholarshipAmount)

    if ((!Number.isFinite(paymentAmount) || paymentAmount <= 0) && adjustmentAmount <= 0) {
      return apiError(400, 'Please enter a valid payment or adjustment amount.')
    }

    const target = {
      debitEntryId: ledgerEntryId || null,
      feeCollectionId: collectionId || null,
      amount: paymentAmount,
    }

    // Retry wrapper for concurrent payment scenarios
    let lastError: unknown = null
    for (let attempt = 0; attempt < PAYMENT_RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await db.$transaction(async (tx) => {
          const generatedReceipt = receiptNumber || (await nextSequentialReceiptNumber(tx, user.schoolId!))
          const paymentResult = paymentAmount > 0
            ? await recordStudentLedgerPayment({
                tx,
                schoolId: user.schoolId!,
                studentId,
                amount: paymentAmount,
                paymentMethod: paymentMethod || 'CASH',
                transactionRef,
                receiptNumber: generatedReceipt,
                paymentDate: paymentDateValue,
                notes,
                receivedBy: user.userId,
                targets: target.debitEntryId || target.feeCollectionId ? [target] : undefined,
              })
            : null

          for (const waiver of [
            { amount: discountAmount, sourceType: 'discount' as const },
            { amount: concessionAmount, sourceType: 'concession' as const },
            { amount: scholarshipAmount, sourceType: 'scholarship' as const },
          ]) {
            if (waiver.amount <= 0) continue
            await recordStudentLedgerWaiver({
              tx,
              schoolId: user.schoolId!,
              studentId,
              amount: waiver.amount,
              sourceType: waiver.sourceType,
              receiptNumber: generatedReceipt,
              paymentDate: paymentDateValue,
              notes,
              createdBy: user.userId,
              targets: target.debitEntryId || target.feeCollectionId
                ? [{ ...target, amount: waiver.amount }]
                : undefined,
            })
          }

          // Enhanced audit logging with snapshots
          const auditContext = extractAuditContext(request, user.userId)
          await logFeeTransaction(
            tx,
            user.schoolId!,
            'StudentFeePayment',
            generatedReceipt,
            'payment_recorded',
            null, // No old value for new payment
            {
              studentId,
              receiptNumber: generatedReceipt,
              amount: paymentAmount,
              paymentMethod,
              paymentDate: paymentDateValue,
              receivedBy: user.userId,
            },
            {
              ...auditContext,
              metadata: {
                paymentAmount,
                adjustmentAmount,
                discountAmount,
                concessionAmount,
                scholarshipAmount,
              },
            }
          )

          return {
            receiptNumber: generatedReceipt,
            payment: paymentResult?.payment || null,
            appliedAmount: paymentResult?.appliedAmount || 0,
          }
        })

        return NextResponse.json(result, { status: 201 })
      } catch (error) {
        lastError = error

        if (!isRetryableError(error)) {
          // Non-retryable error, throw immediately
          throw error
        }

        // Last attempt failed, throw the error
        if (attempt === PAYMENT_RETRY_ATTEMPTS - 1) {
          throw error
        }

        // Wait before retrying with exponential backoff
        const delay = PAYMENT_RETRY_DELAY_MS * Math.pow(2, attempt)
        await sleep(delay)
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Payment recording failed after retries')
  } catch (error) {
    console.error('Record fee payment error:', error)
    return internalError('recording the fee payment')
  }
}
