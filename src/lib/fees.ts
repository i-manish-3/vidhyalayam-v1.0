import { Prisma } from '@prisma/client'

type FeeTx = Prisma.TransactionClient
type LedgerCreditType = 'CREDIT' | 'WAIVER'
type WaiverSourceType = 'discount' | 'concession' | 'scholarship'

interface AssignStudentFeesInput {
  tx: FeeTx
  schoolId: string
  studentId: string
  classId: string | null | undefined
  sectionId?: string | null
  feesGroupId?: string | null
  academicYear: string
  assignedBy?: string | null
  source?: string
  effectiveFrom?: Date | null
  // When true, the student is billed the structure's full year regardless of
  // join month: pre-join MONTHLY items are NOT skipped and dueDates are NOT
  // clamped forward. Used for mid-session admits where the school treats the
  // seat as reserved for the whole year.
  chargeFullYear?: boolean
}

interface FeeDebitInput {
  tx: FeeTx
  schoolId: string
  studentId: string
  academicYear?: string | null
  assignmentId?: string | null
  assignmentItemId?: string | null
  invoiceId?: string | null
  invoiceLineId?: string | null
  feeCollectionId?: string | null
  sourceType: string
  sourceId?: string | null
  feeHeadName?: string | null
  installmentName?: string | null
  description?: string | null
  amount: number
  dueDate?: Date | null
  transactionDate?: Date | null
  notes?: string | null
  createdBy?: string | null
}

interface LedgerAllocationTarget {
  debitEntryId?: string | null
  feeCollectionId?: string | null
  amount?: number
}

interface LedgerCreditInput {
  tx: FeeTx
  schoolId: string
  studentId: string
  amount: number
  entryType: LedgerCreditType
  sourceType: string
  sourceId?: string | null
  academicYear?: string | null
  paymentId?: string | null
  invoiceId?: string | null
  paymentMethod?: string | null
  transactionRef?: string | null
  receiptNumber?: string | null
  paymentDate?: Date | null
  notes?: string | null
  createdBy?: string | null
  targets?: LedgerAllocationTarget[]
}

interface RecordLedgerPaymentInput {
  tx: FeeTx
  schoolId: string
  studentId: string
  amount: number
  paymentMethod?: string | null
  transactionRef?: string | null
  receiptNumber?: string | null
  paymentDate?: Date | null
  notes?: string | null
  receivedBy?: string | null
  academicYear?: string | null
  invoiceId?: string | null
  targets?: LedgerAllocationTarget[]
}

interface RecordLedgerWaiverInput {
  tx: FeeTx
  schoolId: string
  studentId: string
  amount: number
  sourceType: WaiverSourceType
  receiptNumber?: string | null
  paymentDate?: Date | null
  notes?: string | null
  createdBy?: string | null
  academicYear?: string | null
  targets?: LedgerAllocationTarget[]
}

function serialize(value: unknown) {
  return JSON.stringify(value, (_key, current) => {
    if (current instanceof Date) return current.toISOString()
    return current
  })
}

export function generateInvoiceNumber() {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `INV-${Date.now()}-${suffix}`
}

export function generateReceiptNumber() {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `RCP-${Date.now()}-${suffix}`
}

// Sequential per-school receipt number starting at 1. Walks existing payments
// for the school, parses numeric receiptNumber strings, and returns max + 1.
// Old `RCP-…` format payments are skipped (treated as 0) so a fresh sequence
// begins from 1 the first time this is called for any school.
export async function nextSequentialReceiptNumber(tx: FeeTx, schoolId: string): Promise<string> {
  const receipts = await tx.studentFeePayment.findMany({
    where: { schoolId },
    select: { receiptNumber: true },
  })
  const maxNum = receipts
    .map((r) => parseInt(r.receiptNumber, 10))
    .filter((n) => Number.isFinite(n))
    .reduce((m, n) => (n > m ? n : m), 0)
  return String(maxNum + 1)
}

function earliestDate(dates: Array<Date | null | undefined>) {
  const validDates = dates.filter((date): date is Date => !!date)
  if (validDates.length === 0) return null
  return validDates.reduce((earliest, date) => (date < earliest ? date : earliest), validDates[0])
}

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function debitStatus(balance: number, debit: number) {
  if (balance <= 0) return 'settled'
  if (balance < debit) return 'partial'
  return 'open'
}

function collectionStatus(balance: number, billed: number) {
  if (balance <= 0) return 'paid'
  if (balance < billed) return 'partial'
  return 'unpaid'
}

function legacyAdjustmentField(sourceType: string) {
  if (sourceType === 'discount') return 'discount'
  if (sourceType === 'concession') return 'concession'
  if (sourceType === 'scholarship') return 'scholarship'
  return null
}

function paymentStatusFromLedgerStatus(status: string) {
  if (status === 'settled') return 'paid'
  if (status === 'partial') return 'partial'
  if (status === 'cancelled') return 'cancelled'
  return 'unpaid'
}

export async function createFeeDebitLedgerEntry(input: FeeDebitInput) {
  const {
    tx,
    schoolId,
    studentId,
    academicYear,
    assignmentId,
    assignmentItemId,
    invoiceId,
    invoiceLineId,
    feeCollectionId,
    sourceType,
    sourceId,
    feeHeadName,
    installmentName,
    description,
    amount,
    dueDate,
    transactionDate,
    notes,
    createdBy,
  } = input

  const debit = roundMoney(amount)
  if (!Number.isFinite(debit) || debit <= 0) return null

  const duplicateClauses = [
    ...(assignmentItemId ? [{ assignmentItemId }] : []),
    ...(feeCollectionId ? [{ feeCollectionId }] : []),
    ...(sourceId ? [{ sourceType, sourceId }] : []),
  ]
  if (duplicateClauses.length > 0) {
    const existing = await tx.studentFeeLedgerEntry.findFirst({
      where: {
        schoolId,
        studentId,
        entryType: 'DEBIT',
        deletedAt: null,
        OR: duplicateClauses,
      },
    })
    if (existing) return existing
  }

  return tx.studentFeeLedgerEntry.create({
    data: {
      schoolId,
      studentId,
      academicYear: academicYear || null,
      assignmentId: assignmentId || null,
      assignmentItemId: assignmentItemId || null,
      invoiceId: invoiceId || null,
      invoiceLineId: invoiceLineId || null,
      feeCollectionId: feeCollectionId || null,
      entryType: 'DEBIT',
      sourceType,
      sourceId: sourceId || null,
      feeHeadName: feeHeadName || 'Fee',
      installmentName: installmentName || null,
      description: description || null,
      debit,
      credit: 0,
      balanceAmount: debit,
      dueDate: dueDate || null,
      transactionDate: transactionDate || new Date(),
      status: 'open',
      notes: notes || null,
      createdBy: createdBy || null,
    },
  })
}

async function syncInvoiceFromLedger(tx: FeeTx, schoolId: string, invoiceId: string) {
  const debits = await tx.studentFeeLedgerEntry.findMany({
    where: {
      schoolId,
      invoiceId,
      entryType: 'DEBIT',
      deletedAt: null,
      status: { not: 'cancelled' },
    },
    select: { id: true, debit: true, balanceAmount: true },
  })

  const total = roundMoney(debits.reduce((sum, entry) => sum + entry.debit, 0))
  const balance = roundMoney(debits.reduce((sum, entry) => sum + entry.balanceAmount, 0))
  const allocations = debits.length > 0
    ? await tx.studentFeeLedgerAllocation.findMany({
        where: {
          schoolId,
          deletedAt: null,
          debitEntryId: { in: debits.map((entry) => entry.id) },
          creditEntry: { deletedAt: null },
        },
        include: {
          creditEntry: { select: { entryType: true, sourceType: true } },
        },
      })
    : []

  const paidAmount = roundMoney(
    allocations
      .filter((allocation) => allocation.creditEntry.entryType === 'CREDIT')
      .reduce((sum, allocation) => sum + allocation.amount, 0)
  )
  const discount = roundMoney(
    allocations
      .filter((allocation) => allocation.creditEntry.entryType === 'WAIVER' && allocation.creditEntry.sourceType === 'discount')
      .reduce((sum, allocation) => sum + allocation.amount, 0)
  )
  const concession = roundMoney(
    allocations
      .filter((allocation) => allocation.creditEntry.entryType === 'WAIVER' && allocation.creditEntry.sourceType === 'concession')
      .reduce((sum, allocation) => sum + allocation.amount, 0)
  )
  const scholarship = roundMoney(
    allocations
      .filter((allocation) => allocation.creditEntry.entryType === 'WAIVER' && allocation.creditEntry.sourceType === 'scholarship')
      .reduce((sum, allocation) => sum + allocation.amount, 0)
  )
  const settledAmount = roundMoney(paidAmount + discount + concession + scholarship)

  await tx.studentFeeInvoice.updateMany({
    where: { id: invoiceId, schoolId, deletedAt: null },
    data: {
      paidAmount,
      discount,
      concession,
      scholarship,
      status: balance <= 0 ? 'paid' : settledAmount > 0 ? 'partial' : 'unpaid',
    },
  })
}

async function syncLegacyCollectionFromDebit(
  tx: FeeTx,
  debitEntry: {
    id: string
    debit: number
    balanceAmount: number
    invoiceId: string | null
    assignmentItemId: string | null
    invoiceLineId: string | null
    feeCollectionId: string | null
  },
  appliedAmount: number,
  creditEntry: {
    entryType: string
    sourceType: string
    paymentMethod: string | null
    transactionRef: string | null
    receiptNumber: string | null
    transactionDate: Date
    notes: string | null
  }
) {
  if (!debitEntry.feeCollectionId) {
    return
  }

  const collection = await tx.feeCollection.findFirst({
    where: { id: debitEntry.feeCollectionId, deletedAt: null },
    select: {
      id: true,
      amount: true,
      paidAmount: true,
      discount: true,
      concession: true,
      scholarship: true,
      fine: true,
    },
  })
  if (!collection) return

  const nextData: Prisma.FeeCollectionUpdateInput = {}
  if (creditEntry.entryType === 'CREDIT') {
    nextData.paidAmount = roundMoney(collection.paidAmount + appliedAmount)
    nextData.paymentMethod = creditEntry.paymentMethod || undefined
    nextData.transactionRef = creditEntry.transactionRef || undefined
    nextData.paymentDate = creditEntry.transactionDate
    nextData.receiptNumber = creditEntry.receiptNumber || undefined
  } else {
    const adjustmentField = legacyAdjustmentField(creditEntry.sourceType)
    if (adjustmentField) {
      nextData[adjustmentField] = roundMoney(Number(collection[adjustmentField]) + appliedAmount)
    }
  }

  if (creditEntry.notes) {
    nextData.notes = creditEntry.notes
  }

  const projectedPaid = Number(nextData.paidAmount ?? collection.paidAmount)
  const projectedDiscount = Number(nextData.discount ?? collection.discount)
  const projectedConcession = Number(nextData.concession ?? collection.concession)
  const projectedScholarship = Number(nextData.scholarship ?? collection.scholarship)
  const effectiveAmount = roundMoney(collection.amount - projectedDiscount - projectedConcession - projectedScholarship + collection.fine)
  nextData.paymentStatus = collectionStatus(Math.max(0, effectiveAmount - projectedPaid), effectiveAmount)

  await tx.feeCollection.update({
    where: { id: collection.id },
    data: nextData,
  })

  if (debitEntry.invoiceId && debitEntry.assignmentItemId) {
    await tx.studentFeeInvoiceLine.updateMany({
      where: {
        invoiceId: debitEntry.invoiceId,
        assignmentItemId: debitEntry.assignmentItemId,
      },
      data: { status: paymentStatusFromLedgerStatus(debitStatus(debitEntry.balanceAmount, debitEntry.debit)) },
    })
  } else if (debitEntry.invoiceLineId) {
    await tx.studentFeeInvoiceLine.updateMany({
      where: { id: debitEntry.invoiceLineId },
      data: { status: paymentStatusFromLedgerStatus(debitStatus(debitEntry.balanceAmount, debitEntry.debit)) },
    })
  }
}

async function applyLedgerCredit(input: LedgerCreditInput) {
  const {
    tx,
    schoolId,
    studentId,
    amount,
    entryType,
    sourceType,
    sourceId,
    academicYear,
    paymentId,
    invoiceId,
    paymentMethod,
    transactionRef,
    receiptNumber,
    paymentDate,
    notes,
    createdBy,
    targets,
  } = input

  const creditAmount = roundMoney(amount)
  if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
    return { creditEntry: null, appliedAmount: 0, allocations: [] }
  }

  const transactionDate = paymentDate || new Date()
  const creditEntry = await tx.studentFeeLedgerEntry.create({
    data: {
      schoolId,
      studentId,
      academicYear: academicYear || null,
      invoiceId: invoiceId || null,
      paymentId: paymentId || null,
      entryType,
      sourceType,
      sourceId: sourceId || null,
      description: entryType === 'CREDIT' ? 'Fee payment received' : 'Fee adjustment',
      debit: 0,
      credit: creditAmount,
      balanceAmount: creditAmount,
      transactionDate,
      paymentMethod: paymentMethod || null,
      transactionRef: transactionRef || null,
      receiptNumber: receiptNumber || null,
      status: 'open',
      notes: notes || null,
      createdBy: createdBy || null,
    },
  })

  let remaining = creditAmount
  let appliedAmount = 0
  const allocations: Array<{ debitEntryId: string; amount: number; invoiceId: string | null }> = []
  const touchedInvoices = new Set<string>()

  const targetDebits = targets && targets.length > 0
    ? await Promise.all(targets.map(async (target) => {
        const targetClauses = [
          ...(target.debitEntryId ? [{ id: target.debitEntryId }] : []),
          ...(target.feeCollectionId ? [{ feeCollectionId: target.feeCollectionId }] : []),
        ]
        if (targetClauses.length === 0) return null
        const debit = await tx.studentFeeLedgerEntry.findFirst({
          where: {
            schoolId,
            studentId,
            entryType: 'DEBIT',
            deletedAt: null,
            status: { in: ['open', 'partial'] },
            balanceAmount: { gt: 0 },
            OR: targetClauses,
          },
        })
        return debit ? { debit, targetAmount: roundMoney(Number(target.amount || 0)) } : null
      }))
    : []

  const orderedDebits = targetDebits.filter((item): item is NonNullable<typeof item> => !!item)

  if (orderedDebits.length === 0 && (!targets || targets.length === 0)) {
    const debits = await tx.studentFeeLedgerEntry.findMany({
      where: {
        schoolId,
        studentId,
        entryType: 'DEBIT',
        deletedAt: null,
        status: { in: ['open', 'partial'] },
        balanceAmount: { gt: 0 },
        ...(academicYear ? { academicYear } : {}),
        ...(invoiceId ? { invoiceId } : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    })
    orderedDebits.push(...debits.map((debit) => ({ debit, targetAmount: 0 })))
  }

  for (const item of orderedDebits) {
    if (remaining <= 0) break
    const limit = item.targetAmount > 0 ? item.targetAmount : remaining
    const applied = roundMoney(Math.min(remaining, item.debit.balanceAmount, limit))
    if (applied <= 0) continue

    await tx.studentFeeLedgerAllocation.create({
      data: {
        schoolId,
        studentId,
        debitEntryId: item.debit.id,
        creditEntryId: creditEntry.id,
        amount: applied,
        allocatedAt: transactionDate,
        receiptNumber: receiptNumber || null,
        notes: notes || null,
      },
    })

    const nextBalance = roundMoney(item.debit.balanceAmount - applied)
    const updatedDebit = await tx.studentFeeLedgerEntry.update({
      where: { id: item.debit.id },
      data: {
        balanceAmount: nextBalance,
        status: debitStatus(nextBalance, item.debit.debit),
      },
    })

    await syncLegacyCollectionFromDebit(tx, updatedDebit, applied, {
      entryType,
      sourceType,
      paymentMethod: paymentMethod || null,
      transactionRef: transactionRef || null,
      receiptNumber: receiptNumber || null,
      transactionDate,
      notes: notes || null,
    })

    if (updatedDebit.invoiceId) touchedInvoices.add(updatedDebit.invoiceId)
    allocations.push({ debitEntryId: updatedDebit.id, amount: applied, invoiceId: updatedDebit.invoiceId })
    remaining = roundMoney(remaining - applied)
    appliedAmount = roundMoney(appliedAmount + applied)
  }

  const creditBalance = roundMoney(creditAmount - appliedAmount)
  const updatedCredit = await tx.studentFeeLedgerEntry.update({
    where: { id: creditEntry.id },
    data: {
      balanceAmount: creditBalance,
      status: creditBalance <= 0 ? 'settled' : appliedAmount > 0 ? 'partial' : 'open',
    },
  })

  for (const touchedInvoiceId of touchedInvoices) {
    await syncInvoiceFromLedger(tx, schoolId, touchedInvoiceId)
  }

  return { creditEntry: updatedCredit, appliedAmount, allocations }
}

export async function recordStudentLedgerPayment(input: RecordLedgerPaymentInput) {
  const {
    tx,
    schoolId,
    studentId,
    amount,
    paymentMethod = 'CASH',
    transactionRef,
    receiptNumber,
    paymentDate,
    notes,
    receivedBy,
    academicYear,
    invoiceId,
    targets,
  } = input

  const paymentAmount = roundMoney(amount)
  const receipt = receiptNumber || (await nextSequentialReceiptNumber(tx, schoolId))
  const paidAt = paymentDate || new Date()
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return { payment: null, creditEntry: null, appliedAmount: 0, receiptNumber: receipt, allocations: [] }
  }

  const payment = await tx.studentFeePayment.create({
    data: {
      schoolId,
      studentId,
      invoiceId: invoiceId || null,
      amount: paymentAmount,
      paymentMethod: paymentMethod || 'CASH',
      transactionRef: transactionRef || null,
      receiptNumber: receipt,
      paymentDate: paidAt,
      notes: notes || null,
      receivedBy: receivedBy || null,
    },
  })

  const credit = await applyLedgerCredit({
    tx,
    schoolId,
    studentId,
    amount: paymentAmount,
    entryType: 'CREDIT',
    sourceType: 'payment',
    sourceId: payment.id,
    academicYear,
    paymentId: payment.id,
    invoiceId,
    paymentMethod,
    transactionRef,
    receiptNumber: receipt,
    paymentDate: paidAt,
    notes,
    createdBy: receivedBy,
    targets,
  })

  return { payment, receiptNumber: receipt, ...credit }
}

export async function recordStudentLedgerWaiver(input: RecordLedgerWaiverInput) {
  const {
    tx,
    schoolId,
    studentId,
    amount,
    sourceType,
    receiptNumber,
    paymentDate,
    notes,
    createdBy,
    academicYear,
    targets,
  } = input

  return applyLedgerCredit({
    tx,
    schoolId,
    studentId,
    amount,
    entryType: 'WAIVER',
    sourceType,
    academicYear,
    receiptNumber,
    paymentDate,
    notes,
    createdBy,
    targets,
  })
}

export async function assignStudentFeesFromStructure(input: AssignStudentFeesInput) {
  const {
    tx,
    schoolId,
    studentId,
    classId,
    sectionId,
    feesGroupId,
    academicYear,
    assignedBy,
    source = 'manual',
    effectiveFrom,
    chargeFullYear = false,
  } = input

  if (!classId || !feesGroupId) return null

  const structures = await tx.feesStructure.findMany({
    where: {
      schoolId,
      classId,
      feesGroupId,
      academicYear,
      isActive: true,
      status: 'active',
      deletedAt: null,
      OR: [{ sectionId: sectionId || null }, { sectionId: null }],
    },
    include: {
      feesGroup: { select: { id: true, name: true } },
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      items: {
        include: {
          feeHead: {
            select: {
              id: true,
              name: true,
              frequency: true,
              headType: true,
              isOptional: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
  })

  const feeStructure = structures.find((structure) => structure.sectionId === (sectionId || null)) || structures[0]
  if (!feeStructure || feeStructure.items.length === 0) return null

  const existing = await tx.studentFeeAssignment.findFirst({
    where: {
      schoolId,
      studentId,
      feeStructureId: feeStructure.id,
      academicYear,
      deletedAt: null,
    },
    select: { id: true },
  })
  if (existing) return existing

  // Pro-rate by join date: MONTHLY items whose calendar month falls strictly
  // BEFORE the assignment's effective-from month are skipped. Term heads
  // (admission, exam, annual…) are always created in full regardless of when
  // the student joined. UTC math matches fee-demand.ts's monthBounds.
  // When chargeFullYear=true, this pro-rating is bypassed entirely — every
  // structure item is billed regardless of join month.
  const effectiveFromDate = effectiveFrom || new Date()
  const effectiveFromYM = effectiveFromDate.getUTCFullYear() * 12 + effectiveFromDate.getUTCMonth()
  const eligibleStructureItems = chargeFullYear
    ? feeStructure.items
    : feeStructure.items.filter((item) => {
        if (item.frequency !== 'MONTHLY') return true
        if (!item.dueDate) return true
        const itemYM = item.dueDate.getUTCFullYear() * 12 + item.dueDate.getUTCMonth()
        return itemYM >= effectiveFromYM
      })
  if (eligibleStructureItems.length === 0) return null

  const assignment = await tx.studentFeeAssignment.create({
    data: {
      schoolId,
      studentId,
      feeStructureId: feeStructure.id,
      feesGroupId,
      classId,
      sectionId: feeStructure.sectionId,
      academicYear,
      name: feeStructure.name,
      source,
      effectiveFrom: effectiveFromDate,
      assignedBy: assignedBy || null,
      snapshotJson: serialize({
        feeStructure: {
          id: feeStructure.id,
          name: feeStructure.name,
          version: feeStructure.version,
          academicYear: feeStructure.academicYear,
          className: feeStructure.class?.name,
          sectionName: feeStructure.section?.name,
          groupName: feeStructure.feesGroup?.name,
        },
        effectiveFrom: effectiveFromDate.toISOString(),
        billingMode: chargeFullYear ? 'full_year' : 'pro_rated',
        skippedItemCount: feeStructure.items.length - eligibleStructureItems.length,
        items: eligibleStructureItems.map((item) => ({
          feeStructureItemId: item.id,
          feeHeadId: item.feeHeadId,
          feeHeadName: item.feeHead?.name,
          billingBehavior: item.frequency,
          installmentName: item.installmentName,
          amount: item.amount,
          // Clamp every item's dueDate to be no earlier than the student's
          // effectiveFrom — so a school-template "1-Apr" admission-fee due
          // date doesn't render as overdue on a July admit's day-zero slip.
          // Skipped when chargeFullYear=true: those April fees are
          // legitimately overdue for a full-year mid-session admit.
          dueDate: !chargeFullYear && item.dueDate && item.dueDate < effectiveFromDate ? effectiveFromDate : item.dueDate,
          structureDueDate: item.dueDate,
          lateFee: item.lateFee,
          headType: item.feeHead?.headType,
          isOptional: item.feeHead?.isOptional,
        })),
      }),
    },
  })

  const assignmentItems: Array<{
    source: { id: string }
    snapshot: {
      id: string
      feeStructureItemId: string | null
      feeHeadName: string
      installmentName: string
      amount: number
      dueDate: Date | null
    }
    invoiceLineId?: string
    feeCollectionId?: string
  }> = []
  for (const item of eligibleStructureItems) {
    // Clamp dueDate to >= effectiveFrom. Flows downstream to the invoice
    // line, FeeCollection, and ledger debit via item.snapshot.dueDate.
    // chargeFullYear=true skips the clamp so structure due dates are honored
    // verbatim (pre-join months land as overdue, intentionally).
    const effectiveDueDate =
      !chargeFullYear && item.dueDate && item.dueDate < effectiveFromDate ? effectiveFromDate : item.dueDate
    const assignmentItem = await tx.studentFeeAssignmentItem.create({
      data: {
        assignmentId: assignment.id,
        feeStructureItemId: item.id,
        feeHeadId: item.feeHeadId,
        feeHeadName: item.feeHead?.name || 'Fee',
        billingBehavior: item.frequency,
        installmentName: item.installmentName,
        amount: item.amount,
        dueDate: effectiveDueDate,
        lateFee: item.lateFee,
        headType: item.feeHead?.headType || 'STANDARD',
        isOptional: item.feeHead?.isOptional || false,
      },
    })
    assignmentItems.push({ source: item, snapshot: assignmentItem })
  }

  const subtotal = assignmentItems.reduce((sum, item) => sum + item.snapshot.amount, 0)
  const invoice = await tx.studentFeeInvoice.create({
    data: {
      schoolId,
      studentId,
      assignmentId: assignment.id,
      invoiceNumber: generateInvoiceNumber(),
      dueDate: earliestDate(assignmentItems.map((item) => item.snapshot.dueDate)),
      subtotal,
      totalAmount: subtotal,
      status: 'unpaid',
      notes: `Opening fee demand for ${feeStructure.name}`,
    },
  })

  for (const item of assignmentItems) {
    const invoiceLine = await tx.studentFeeInvoiceLine.create({
      data: {
        invoiceId: invoice.id,
        assignmentItemId: item.snapshot.id,
        feeHeadName: item.snapshot.feeHeadName,
        installmentName: item.snapshot.installmentName,
        amount: item.snapshot.amount,
        totalAmount: item.snapshot.amount,
        dueDate: item.snapshot.dueDate,
      },
    })
    item.invoiceLineId = invoiceLine.id
  }

  for (const item of assignmentItems) {
    const feeCollection = await tx.feeCollection.create({
      data: {
        schoolId,
        studentId,
        feeStructureItemId: item.snapshot.feeStructureItemId,
        studentFeeAssignmentItemId: item.snapshot.id,
        studentFeeInvoiceId: invoice.id,
        amount: item.snapshot.amount,
        paidAmount: 0,
        discount: 0,
        concession: 0,
        scholarship: 0,
        fine: 0,
        paymentStatus: 'unpaid',
        dueDate: item.snapshot.dueDate,
        installmentName: item.snapshot.installmentName,
        feeHeadName: item.snapshot.feeHeadName,
        notes: `Fee snapshot from ${feeStructure.name}`,
      },
    })
    item.feeCollectionId = feeCollection.id

    await createFeeDebitLedgerEntry({
      tx,
      schoolId,
      studentId,
      academicYear,
      assignmentId: assignment.id,
      assignmentItemId: item.snapshot.id,
      invoiceId: invoice.id,
      invoiceLineId: item.invoiceLineId,
      feeCollectionId: feeCollection.id,
      sourceType: 'assignment',
      sourceId: item.snapshot.id,
      feeHeadName: item.snapshot.feeHeadName,
      installmentName: item.snapshot.installmentName,
      description: `${item.snapshot.feeHeadName} - ${item.snapshot.installmentName}`,
      amount: item.snapshot.amount,
      dueDate: item.snapshot.dueDate,
      notes: `Fee snapshot from ${feeStructure.name}`,
      createdBy: assignedBy,
    })
  }

  await tx.feeAuditLog.create({
    data: {
      schoolId,
      entityType: 'StudentFeeAssignment',
      entityId: assignment.id,
      action: 'created',
      changedBy: assignedBy || null,
      newValue: serialize({
        studentId,
        feeStructureId: feeStructure.id,
        academicYear,
        itemCount: assignmentItems.length,
        totalAmount: subtotal,
      }),
    },
  })

  return assignment
}
