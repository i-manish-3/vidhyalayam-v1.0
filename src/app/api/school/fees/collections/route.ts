import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import {
  createFeeDebitLedgerEntry,
  generateReceiptNumber,
  recordStudentLedgerPayment,
  recordStudentLedgerWaiver,
} from '@/lib/fees'

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

    const receiptHistory = credits.map((credit) => {
      const feePeriods = new Set<string>()
      const transportPeriods = new Set<string>()
      const hostelPeriods = new Set<string>()
      const sessions = new Set<string>()
      let discount = 0
      let dues = 0

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
        dues += debit.balanceAmount + laterAllocated
      }

      return {
        id: credit.id,
        receiptNumber: stripReceiptPrefix(credit.receiptNumber),
        studentName: credit.student ? `${credit.student.firstName} ${credit.student.lastName}`.trim() : '-',
        className: credit.student?.class?.name || '-',
        feeMonth: sortPeriods(Array.from(feePeriods)).join(', '),
        transportMonth: sortPeriods(Array.from(transportPeriods)).join(', '),
        hostelMonth: sortPeriods(Array.from(hostelPeriods)).join(', '),
        date: credit.transactionDate,
        discount: roundMoney(discount),
        paid: credit.credit,
        dues: roundMoney(dues),
        paymentMethod: credit.paymentMethod,
        session: Array.from(sessions).sort().join(', ') || academicYear || null,
        receiptId: credit.receiptNumber,
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
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
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
    } = body

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

    const generatedReceipt = receiptNumber || generateReceiptNumber()
    const paymentDateValue = paymentDate ? new Date(paymentDate) : new Date()

    if (Array.isArray(payments)) {
      if (payments.length === 0) {
        return apiError(400, 'Please select at least one fee particular.')
      }

      const result = await db.$transaction(async (tx) => {
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
              notes,
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
            notes,
            createdBy: user.userId,
            targets: discountTargets,
          })
        }

        await tx.feeAuditLog.create({
          data: {
            schoolId: user.schoolId!,
            entityType: 'StudentFeeLedgerEntry',
            entityId: generatedReceipt,
            action: 'ledger_payment_recorded',
            changedBy: user.userId,
            newValue: JSON.stringify({
              studentId,
              receiptNumber: generatedReceipt,
              paymentMethod,
              totalPaid,
              totalDiscount,
              rowCount: payments.length,
            }),
          },
        })

        return {
          receiptNumber: generatedReceipt,
          payment: paymentResult?.payment || null,
          appliedAmount: paymentResult?.appliedAmount || 0,
        }
      })

      return NextResponse.json(result, { status: 201 })
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

    const result = await db.$transaction(async (tx) => {
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

      await tx.feeAuditLog.create({
        data: {
          schoolId: user.schoolId!,
          entityType: 'StudentFeeLedgerEntry',
          entityId: generatedReceipt,
          action: 'ledger_payment_recorded',
          changedBy: user.userId,
          newValue: JSON.stringify({
            studentId,
            paymentAmount,
            adjustmentAmount,
            paymentMethod,
            receiptNumber: generatedReceipt,
          }),
        },
      })

      return {
        receiptNumber: generatedReceipt,
        payment: paymentResult?.payment || null,
        appliedAmount: paymentResult?.appliedAmount || 0,
      }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Record fee payment error:', error)
    return internalError('recording the fee payment')
  }
}
