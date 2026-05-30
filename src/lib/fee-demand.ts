import { Prisma } from '@prisma/client'
import pLimit from 'p-limit'
import { db } from '@/lib/db'
import { createFeeDebitLedgerEntry } from '@/lib/fees'

const BULK_GENERATE_CONCURRENCY = Number(process.env.FEE_DEMAND_GENERATE_CONCURRENCY) || 5
const SLIP_NUMBER_RETRIES = 3

type FeeTx = Prisma.TransactionClient

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export interface GenerateSlipArgs {
  schoolId: string
  studentId: string
  month: number
  year: number
  generatedBy?: string | null
  demandRunId?: string | null
  force?: boolean
}

export type SlipResult =
  | { status: 'created'; invoiceId: string; invoiceNumber: string; totalAmount: number; subtotal: number; previousBalance: number; itemCount: number }
  | { status: 'skipped'; reason: 'exists' | 'no-items' | 'no-active-assignment'; invoiceId?: string }
  | { status: 'failed'; error: string }

export interface BulkArgs {
  schoolId: string
  month: number
  year: number
  filters?: { classId?: string | null; sectionId?: string | null; studentIds?: string[] | null }
  generatedBy?: string | null
  force?: boolean
  dryRun?: boolean
}

export interface BulkResult {
  runId: string | null
  totalStudents: number
  successCount: number
  skippedCount: number
  failedCount: number
  totalAmount: number
  errors: Array<{ studentId: string; error: string }>
  preview?: Array<{ studentId: string; itemCount: number; subtotal: number; previousBalance: number; totalAmount: number; skipReason?: string }>
}

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

// Strip characters that can't round-trip through a WIN1252 Postgres database
// (the dev box here is on WIN1252, so Prisma's pretty-printed arrows like →
// would crash the .update call). Keeps ASCII + Latin-1 supplement, replaces
// anything else (em-dashes, arrows, emoji) with '?'. Truncates to 2 KB so
// stack traces don't bloat the errorLog column.
function sanitizeForDb(s: string): string {
  return s.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?').slice(0, 2000)
}

function monthBounds(month: number, year: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  return { start, end }
}

export async function nextSequentialDemandSlipNumber(
  tx: FeeTx,
  schoolId: string,
  month: number,
  year: number
): Promise<string> {
  const school = await tx.school.findUnique({
    where: { id: schoolId },
    select: { subdomain: true, academicYear: true },
  })
  const subdomain = (school?.subdomain || 'school').toUpperCase()
  const academicYear = school?.academicYear || `${year}-${year + 1}`
  const monthAbbr = MONTH_ABBR[month - 1] || 'XXX'
  const prefix = `DS/${academicYear}/${subdomain}/${monthAbbr}/`

  const existing = await tx.studentFeeInvoice.findMany({
    where: {
      schoolId,
      isMonthlyDemand: true,
      billingMonth: month,
      billingYear: year,
    },
    select: { invoiceNumber: true },
  })
  const maxSeq = existing
    .map((row) => {
      const tail = row.invoiceNumber.startsWith(prefix) ? row.invoiceNumber.slice(prefix.length) : ''
      const n = parseInt(tail, 10)
      return Number.isFinite(n) ? n : 0
    })
    .reduce((m, n) => (n > m ? n : m), 0)

  return `${prefix}${String(maxSeq + 1).padStart(5, '0')}`
}

export async function computePreviousBalance(
  tx: FeeTx,
  schoolId: string,
  studentId: string,
  asOfDate: Date
): Promise<number> {
  const debits = await tx.studentFeeLedgerEntry.findMany({
    where: {
      schoolId,
      studentId,
      entryType: 'DEBIT',
      deletedAt: null,
      status: { not: 'cancelled' },
      transactionDate: { lt: asOfDate },
    },
    select: { balanceAmount: true },
  })
  return roundMoney(debits.reduce((sum, e) => sum + e.balanceAmount, 0))
}

interface DueItem {
  id: string
  assignmentId: string
  feeStructureItemId: string | null
  feeHeadId: string | null
  feeHeadName: string
  installmentName: string
  amount: number
  dueDate: Date | null
  billingBehavior: string
  assignmentAcademicYear: string
}

export async function selectDueAssignmentItems(
  tx: FeeTx,
  schoolId: string,
  studentId: string,
  month: number,
  year: number,
  // When the caller is previewing a force-regenerate, the existing invoice
  // hasn't actually been soft-deleted yet — pass its id here so its lines
  // are excluded from the "already billed" filter.
  excludeInvoiceId?: string | null
): Promise<DueItem[]> {
  const { start, end } = monthBounds(month, year)
  // Year-month index of the slip being generated; used to skip MONTHLY items
  // that belong to months strictly before the student's effectiveFrom (i.e.
  // back months they hadn't joined for yet).
  const slipYM = year * 12 + (month - 1)

  const assignments = await tx.studentFeeAssignment.findMany({
    where: {
      schoolId,
      studentId,
      status: 'active',
      deletedAt: null,
    },
    select: {
      id: true,
      academicYear: true,
      effectiveFrom: true,
      effectiveTo: true,
      items: {
        where: { status: 'active' },
        select: {
          id: true,
          assignmentId: true,
          feeStructureItemId: true,
          feeHeadId: true,
          feeHeadName: true,
          installmentName: true,
          amount: true,
          dueDate: true,
          billingBehavior: true,
        },
      },
    },
  })

  const candidates: DueItem[] = []
  for (const assignment of assignments) {
    const eff = assignment.effectiveFrom
    const effYM = eff ? eff.getUTCFullYear() * 12 + eff.getUTCMonth() : null
    const effTo = assignment.effectiveTo
    const effToYM = effTo ? effTo.getUTCFullYear() * 12 + effTo.getUTCMonth() : null
    for (const item of assignment.items) {
      const isMonthly = item.billingBehavior === 'MONTHLY'
      const dueInMonth = item.dueDate && item.dueDate >= start && item.dueDate < end
      // Pro-rate by join date: MONTHLY items whose billing month is strictly
      // before the assignment's effectiveFrom month are skipped. Term heads
      // (matched via dueInMonth) are unaffected — they're charged in full.
      if (isMonthly && effYM !== null && slipYM < effYM) continue
      // Pro-rate by leave date: MONTHLY items whose billing month is strictly
      // AFTER effectiveTo's month are also skipped. Same rule applied to
      // term heads via dueInMonth check below — if they fall after effectiveTo
      // they won't be in the slip's month window anyway, so the OR-bound
      // here is enough.
      if (isMonthly && effToYM !== null && slipYM > effToYM) continue
      // For non-MONTHLY items, hard-stop them once the assignment's window
      // has closed before the slip's month even if their dueDate happens
      // to fall in the slip month — a withdrawn student shouldn't be
      // billed for a term head that nominally falls after they left.
      if (!isMonthly && effToYM !== null && slipYM > effToYM) continue
      if (isMonthly || dueInMonth) {
        candidates.push({
          ...item,
          assignmentAcademicYear: assignment.academicYear,
        })
      }
    }
  }

  if (candidates.length === 0) return []

  const alreadyBilled = await tx.studentFeeInvoiceLine.findMany({
    where: {
      assignmentItemId: { in: candidates.map((c) => c.id) },
      invoice: {
        schoolId,
        studentId,
        isMonthlyDemand: true,
        billingMonth: month,
        billingYear: year,
        deletedAt: null,
        ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
      },
    },
    select: { assignmentItemId: true },
  })
  const billedSet = new Set(alreadyBilled.map((r) => r.assignmentItemId).filter((id): id is string => !!id))

  return candidates.filter((c) => !billedSet.has(c.id))
}

export async function generateMonthlyDemandSlip(
  tx: FeeTx,
  args: GenerateSlipArgs
): Promise<SlipResult> {
  const { schoolId, studentId, month, year, generatedBy, demandRunId, force } = args

  const existing = await tx.studentFeeInvoice.findFirst({
    where: {
      schoolId,
      studentId,
      billingMonth: month,
      billingYear: year,
      isMonthlyDemand: true,
      deletedAt: null,
    },
    select: { id: true },
  })

  if (existing) {
    if (!force) {
      return { status: 'skipped', reason: 'exists', invoiceId: existing.id }
    }

    // Force-regen step 1 of 2: evict any *older* discarded invoices in this
    // slot left behind by earlier force-regens. They live as (isMonthly=false,
    // deletedAt=set) rows and would collide with the constraint when we flip
    // the current row to (false). Notifications/lines have required FKs so
    // we hard-delete them; ledger and payments have nullable invoiceId so we
    // just detach.
    const priorDiscarded = await tx.studentFeeInvoice.findMany({
      where: {
        schoolId, studentId,
        billingMonth: month, billingYear: year,
        isMonthlyDemand: false,
        deletedAt: { not: null },
      },
      select: { id: true },
    })
    if (priorDiscarded.length > 0) {
      const priorIds = priorDiscarded.map((r) => r.id)
      await tx.studentFeeLedgerEntry.updateMany({
        where: { invoiceId: { in: priorIds } },
        data: { invoiceId: null, invoiceLineId: null },
      })
      await tx.studentFeePayment.updateMany({
        where: { invoiceId: { in: priorIds } },
        data: { invoiceId: null },
      })
      await tx.feeNotification.deleteMany({
        where: { invoiceId: { in: priorIds } },
      })
      await tx.studentFeeInvoiceLine.deleteMany({
        where: { invoiceId: { in: priorIds } },
      })
      await tx.studentFeeInvoice.deleteMany({
        where: { id: { in: priorIds } },
      })
    }

    // Force-regen step 2 of 2: soft-delete the current invoice and flip
    // isMonthlyDemand=false so the constraint slot frees up for the new row.
    await tx.studentFeeInvoice.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
        isMonthlyDemand: false,
        notes: 'Superseded by force-regenerate',
      },
    })
    await tx.studentFeeLedgerEntry.updateMany({
      where: { invoiceId: existing.id, deletedAt: null },
      data: { status: 'cancelled' },
    })
  }

  const dueItems = await selectDueAssignmentItems(tx, schoolId, studentId, month, year)
  if (dueItems.length === 0) {
    return { status: 'skipped', reason: 'no-items' }
  }

  const { start: firstDayOfMonth } = monthBounds(month, year)

  const config = await tx.feeDemandConfig.findUnique({
    where: { schoolId },
    select: { dueDay: true },
  })
  const dueDay = Math.min(Math.max(config?.dueDay ?? 10, 1), 28)
  const dueDate = new Date(Date.UTC(year, month - 1, dueDay, 0, 0, 0, 0))

  const previousBalance = await computePreviousBalance(tx, schoolId, studentId, firstDayOfMonth)
  const subtotal = roundMoney(dueItems.reduce((s, i) => s + i.amount, 0))
  const totalAmount = roundMoney(subtotal + previousBalance)

  const invoiceNumber = await nextSequentialDemandSlipNumber(tx, schoolId, month, year)

  const academicYear = dueItems[0]?.assignmentAcademicYear || null
  const assignmentId = dueItems[0]?.assignmentId || null

  const invoice = await tx.studentFeeInvoice.create({
    data: {
      schoolId,
      studentId,
      assignmentId,
      invoiceNumber,
      invoiceDate: firstDayOfMonth,
      dueDate,
      subtotal,
      totalAmount,
      previousBalance,
      billingMonth: month,
      billingYear: year,
      isMonthlyDemand: true,
      generatedBy: generatedBy || null,
      demandRunId: demandRunId || null,
      status: 'unpaid',
      notes: `Monthly demand for ${MONTH_ABBR[month - 1]} ${year}`,
    },
  })

  for (const item of dueItems) {
    const line = await tx.studentFeeInvoiceLine.create({
      data: {
        invoiceId: invoice.id,
        assignmentItemId: item.id,
        feeHeadName: item.feeHeadName,
        installmentName: item.installmentName,
        amount: item.amount,
        totalAmount: item.amount,
        dueDate,
      },
    })

    await createFeeDebitLedgerEntry({
      tx,
      schoolId,
      studentId,
      academicYear: item.assignmentAcademicYear,
      assignmentId: item.assignmentId,
      assignmentItemId: item.id,
      invoiceId: invoice.id,
      invoiceLineId: line.id,
      sourceType: 'monthly_demand',
      sourceId: line.id,
      feeHeadName: item.feeHeadName,
      installmentName: item.installmentName,
      description: `${item.feeHeadName} - ${item.installmentName} (${MONTH_ABBR[month - 1]} ${year})`,
      amount: item.amount,
      dueDate,
      transactionDate: firstDayOfMonth,
      createdBy: generatedBy || null,
    })

    if (item.billingBehavior !== 'MONTHLY') {
      await tx.studentFeeAssignmentItem.update({
        where: { id: item.id },
        data: { status: 'billed' },
      })
    }
  }

  await tx.feeAuditLog.create({
    data: {
      schoolId,
      entityType: 'StudentFeeInvoice',
      entityId: invoice.id,
      action: 'monthly_demand_generated',
      changedBy: generatedBy || null,
      newValue: JSON.stringify({
        studentId,
        month,
        year,
        itemCount: dueItems.length,
        subtotal,
        previousBalance,
        totalAmount,
        demandRunId: demandRunId || null,
        force: !!force,
      }),
    },
  })

  return {
    status: 'created',
    invoiceId: invoice.id,
    invoiceNumber,
    totalAmount,
    subtotal,
    previousBalance,
    itemCount: dueItems.length,
  }
}

async function resolveStudentIds(schoolId: string, filters?: BulkArgs['filters']): Promise<string[]> {
  const where: Prisma.StudentWhereInput = {
    schoolId,
    isActive: true,
    deletedAt: null,
  }
  if (filters?.studentIds && filters.studentIds.length > 0) {
    where.id = { in: filters.studentIds }
  } else {
    if (filters?.classId) where.classId = filters.classId
    if (filters?.sectionId) where.sectionId = filters.sectionId
  }
  const students = await db.student.findMany({ where, select: { id: true } })
  return students.map((s) => s.id)
}

export async function generateBulkDemandSlips(args: BulkArgs): Promise<BulkResult> {
  const { schoolId, month, year, filters, generatedBy, force, dryRun } = args
  const studentIds = await resolveStudentIds(schoolId, filters)

  if (dryRun) {
    return db.$transaction(async (tx) => {
      const preview: NonNullable<BulkResult['preview']> = []
      let total = 0
      let success = 0
      let skipped = 0
      for (const studentId of studentIds) {
        // Check existing first so we can short-circuit (force=false) and so
        // we can pass excludeInvoiceId to selectDueAssignmentItems when
        // previewing a force-regenerate (otherwise its lines would mask the
        // candidates and we'd preview 0).
        const existing = await tx.studentFeeInvoice.findFirst({
          where: { schoolId, studentId, isMonthlyDemand: true, billingMonth: month, billingYear: year, deletedAt: null },
          select: { id: true },
        })
        if (existing && !force) {
          preview.push({ studentId, itemCount: 0, subtotal: 0, previousBalance: 0, totalAmount: 0, skipReason: 'exists' })
          skipped += 1
          continue
        }
        const items = await selectDueAssignmentItems(
          tx, schoolId, studentId, month, year,
          existing && force ? existing.id : null
        )
        if (items.length === 0) {
          preview.push({ studentId, itemCount: 0, subtotal: 0, previousBalance: 0, totalAmount: 0, skipReason: 'no-items' })
          skipped += 1
          continue
        }
        const { start } = monthBounds(month, year)
        const previousBalance = await computePreviousBalance(tx, schoolId, studentId, start)
        const subtotal = roundMoney(items.reduce((s, i) => s + i.amount, 0))
        const totalAmount = roundMoney(subtotal + previousBalance)
        preview.push({ studentId, itemCount: items.length, subtotal, previousBalance, totalAmount })
        total = roundMoney(total + totalAmount)
        success += 1
      }
      return {
        runId: null,
        totalStudents: studentIds.length,
        successCount: success,
        skippedCount: skipped,
        failedCount: 0,
        totalAmount: total,
        errors: [],
        preview,
      }
    })
  }

  const run = await db.feeDemandRun.create({
    data: {
      schoolId,
      billingMonth: month,
      billingYear: year,
      triggerType: 'MANUAL',
      triggeredBy: generatedBy || null,
      status: 'running',
      totalStudents: studentIds.length,
      filters: filters ? JSON.stringify(filters) : null,
    },
  })

  let successCount = 0
  let skippedCount = 0
  let failedCount = 0
  let totalAmount = 0
  const errors: Array<{ studentId: string; error: string }> = []

  const limit = pLimit(BULK_GENERATE_CONCURRENCY)

  await Promise.all(
    studentIds.map((studentId) =>
      limit(async () => {
        try {
          // Retry the whole transaction on unique-constraint collisions on
          // the slip number — two parallel workers can compute the same
          // sequence before either commits. The DB unique constraint catches
          // it; we just re-run.
          let result: SlipResult | null = null
          let lastErr: unknown = null
          for (let attempt = 0; attempt < SLIP_NUMBER_RETRIES; attempt++) {
            try {
              result = await db.$transaction((tx) =>
                generateMonthlyDemandSlip(tx, {
                  schoolId,
                  studentId,
                  month,
                  year,
                  generatedBy: generatedBy || null,
                  demandRunId: run.id,
                  force,
                })
              )
              break
            } catch (err) {
              lastErr = err
              // Postgres returns meta.target as a string (constraint name);
              // other connectors return an array of column names. Accept both
              // shapes and treat any P2002 as retryable — within a single bulk
              // run the only realistic collisions are on the slip number or
              // monthly_demand_unique slot freed by force-regenerate.
              if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002'
              ) {
                continue
              }
              throw err
            }
          }
          if (!result) throw lastErr instanceof Error ? lastErr : new Error('Slip generation failed after retries')

          if (result.status === 'created') {
            successCount += 1
            totalAmount = roundMoney(totalAmount + result.totalAmount)
          } else if (result.status === 'skipped') {
            skippedCount += 1
          } else {
            failedCount += 1
            errors.push({ studentId, error: sanitizeForDb(result.error) })
          }
        } catch (err) {
          failedCount += 1
          const msg = err instanceof Error ? err.message : String(err)
          errors.push({ studentId, error: sanitizeForDb(msg) })
        }
      })
    )
  )

  const finalStatus = failedCount === 0 ? 'completed' : successCount > 0 ? 'partial' : 'failed'
  await db.feeDemandRun.update({
    where: { id: run.id },
    data: {
      status: finalStatus,
      successCount,
      skippedCount,
      failedCount,
      totalAmount,
      errorLog: errors.length > 0 ? JSON.stringify(errors) : null,
      completedAt: new Date(),
    },
  })

  return {
    runId: run.id,
    totalStudents: studentIds.length,
    successCount,
    skippedCount,
    failedCount,
    totalAmount,
    errors,
  }
}
