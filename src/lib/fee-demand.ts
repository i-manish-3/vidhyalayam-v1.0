import { Prisma } from '@prisma/client'
import pLimit from 'p-limit'
import { db } from '@/lib/db'
import { createFeeDebitLedgerEntry } from '@/lib/fees'
import { logFeeTransaction } from '@/lib/audit'

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
  upToMonth?: number | null
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
  upToMonth?: number | null
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

  // Get custom format from config
  const config = await tx.feeDemandConfig.findUnique({
    where: { schoolId },
    select: { slipNumberFormat: true },
  })

  const subdomain = (school?.subdomain || 'school').toUpperCase()
  const academicYear = school?.academicYear || `${year}-${year + 1}`
  const monthAbbr = MONTH_ABBR[month - 1] || 'XXX'

  // Use custom format or default
  const format = config?.slipNumberFormat || 'DS/{academicYear}/{month}/{sequence}'

  // Replace template variables (except {sequence})
  const prefix = format
    .replace('{academicYear}', academicYear)
    .replace('{subdomain}', subdomain)
    .replace('{month}', monthAbbr)
    .replace('{year}', String(year))
    .replace('/{sequence}', '/') // Remove sequence placeholder temporarily

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

  const sequence = String(maxSeq + 1).padStart(5, '0')

  // Replace {sequence} in the original format
  return format
    .replace('{academicYear}', academicYear)
    .replace('{subdomain}', subdomain)
    .replace('{month}', monthAbbr)
    .replace('{year}', String(year))
    .replace('{sequence}', sequence)
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
  excludeInvoiceId?: string | null,
  // When set, only include MONTHLY items up to and including this month.
  // Catch-up behavior: if generating July slip, include all unbilled months
  // from the earliest unbilled month up to July.
  // Term items (ADMISSION, EXAM, etc.) are unaffected — they're included
  // based on their dueDate falling in the slip's billing month window.
  upToMonth?: number | null
): Promise<DueItem[]> {
  const { start, end } = monthBounds(month, year)
  // Year-month index of the slip being generated
  const slipYM = year * 12 + (month - 1)
  const upToYM = upToMonth ? year * 12 + (upToMonth - 1) : slipYM

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

      // For term fees: include if dueDate is on or before the end of selected month (catch-up)
      const termFeeDue = !isMonthly && item.dueDate && item.dueDate < end

      // Compute the item's billing month for MONTHLY items
      let itemYM: number | null = null
      if (isMonthly && item.dueDate) {
        itemYM = item.dueDate.getUTCFullYear() * 12 + item.dueDate.getUTCMonth()
      }

      // Pro-rate by join date: MONTHLY items whose billing month is strictly
      // before the assignment's effectiveFrom month are skipped. Term heads
      // (matched via dueInMonth) are unaffected — they're charged in full.
      if (isMonthly && effYM !== null && itemYM !== null && itemYM < effYM) continue
      // Pro-rate by leave date: MONTHLY items whose billing month is strictly
      // AFTER effectiveTo's month are also skipped. Same rule applied to
      // term heads via dueInMonth check below — if they fall after effectiveTo
      // they won't be in the slip's month window anyway, so the OR-bound
      // here is enough.
      if (isMonthly && effToYM !== null && itemYM !== null && itemYM > effToYM) continue
      // For MONTHLY items: include all months up to and including upToYM (or slipYM if upToMonth not set)
      // Skip future months beyond the selected month
      if (isMonthly && itemYM !== null && itemYM > upToYM) continue
      // For non-MONTHLY items, hard-stop them once the assignment's window
      // has closed before the slip's month even if their dueDate happens
      // to fall in the slip month — a withdrawn student shouldn't be
      // billed for a term head that nominally falls after they left.
      if (!isMonthly && effToYM !== null && slipYM > effToYM) continue

      // Include if: MONTHLY fee OR term fee with dueDate <= end of selected month
      if (isMonthly || termFeeDue) {
        candidates.push({
          ...item,
          assignmentAcademicYear: assignment.academicYear,
        })
      }
    }
  }

  if (candidates.length === 0) return []

  // Filter out items that have already been billed in ANY demand slip (not just this month).
  // This allows catch-up behavior: if June was never billed, it will be included when
  // generating July slip. But if June was already billed (even if unpaid), skip it.
  const alreadyBilled = await tx.studentFeeInvoiceLine.findMany({
    where: {
      assignmentItemId: { in: candidates.map((c) => c.id) },
      invoice: {
        schoolId,
        studentId,
        isMonthlyDemand: true,
        deletedAt: null,
        ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
      },
    },
    select: { assignmentItemId: true },
  })
  const billedSet = new Set(alreadyBilled.map((r) => r.assignmentItemId).filter((id): id is string => !!id))

  return candidates.filter((c) => !billedSet.has(c.id))
}

// Fetch unpaid transport fees for all months up to the selected month.
// Transport fees are stored as FeeCollection rows (not assignment items) with
// sourceType='transport' in the ledger.
//
// Unlike tuition fees (which use catch-up behavior where old months go to "Previous Dues"),
// transport fees include ALL unpaid months in the main slip because transport is allocated
// monthly and we want to show all pending transport dues together.
export async function selectDueTransportFees(
  tx: FeeTx,
  schoolId: string,
  studentId: string,
  month: number,
  year: number,
  upToMonth?: number | null
): Promise<Array<{
  id: string
  feeHeadName: string
  installmentName: string
  amount: number
  dueDate: Date | null
  academicYear: string | null
}>> {
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  // Include all months up to and including the selected month
  const targetMonth = upToMonth || month
  const targetMonths: string[] = []

  // Academic year runs Apr-Mar, so include months from Apr of current academic year
  // up to the target month. If target is Jan/Feb/Mar, also include those.
  const academicYearStart = 4 // April = month 4

  if (targetMonth >= academicYearStart) {
    // Target is Apr-Dec: include Apr to target
    for (let m = academicYearStart; m <= targetMonth; m++) {
      targetMonths.push(MONTH_NAMES[m - 1])
    }
  } else {
    // Target is Jan-Mar: include Apr-Dec from previous year + Jan to target
    for (let m = academicYearStart; m <= 12; m++) {
      targetMonths.push(MONTH_NAMES[m - 1])
    }
    for (let m = 1; m <= targetMonth; m++) {
      targetMonths.push(MONTH_NAMES[m - 1])
    }
  }

  // Find unpaid transport debits with matching installment name
  const debits = await tx.studentFeeLedgerEntry.findMany({
    where: {
      schoolId,
      studentId,
      entryType: 'DEBIT',
      sourceType: 'transport',
      deletedAt: null,
      status: { in: ['open', 'partial'] },
      balanceAmount: { gt: 0 },
      installmentName: { in: targetMonths },
    },
    select: {
      id: true,
      feeHeadName: true,
      installmentName: true,
      balanceAmount: true,
      dueDate: true,
      academicYear: true,
    },
  })

  return debits.map((d) => ({
    id: d.id,
    feeHeadName: d.feeHeadName || 'Transport Fee',
    installmentName: d.installmentName || '',
    amount: d.balanceAmount,
    dueDate: d.dueDate,
    academicYear: d.academicYear,
  }))
}

export async function generateMonthlyDemandSlip(
  tx: FeeTx,
  args: GenerateSlipArgs
): Promise<SlipResult> {
  const { schoolId, studentId, month, year, generatedBy, demandRunId, force, upToMonth } = args

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

  const dueItems = await selectDueAssignmentItems(tx, schoolId, studentId, month, year, null, upToMonth)
  const transportFees = await selectDueTransportFees(tx, schoolId, studentId, month, year, upToMonth)

  if (dueItems.length === 0 && transportFees.length === 0) {
    return { status: 'skipped', reason: 'no-items' }
  }

  // Calculate subtotal - skip if total amount is 0
  const assignmentSubtotal = roundMoney(dueItems.reduce((s, i) => s + i.amount, 0))
  const transportSubtotal = roundMoney(transportFees.reduce((s, i) => s + i.amount, 0))
  const subtotal = roundMoney(assignmentSubtotal + transportSubtotal)

  if (subtotal === 0) {
    return { status: 'skipped', reason: 'no-items' }
  }

  const { start: firstDayOfMonth } = monthBounds(month, year)

  const config = await tx.feeDemandConfig.findUnique({
    where: { schoolId },
    select: { dueDay: true },
  })
  const dueDay = Math.min(Math.max(config?.dueDay ?? 10, 1), 28)
  const dueDate = new Date(Date.UTC(year, month - 1, dueDay, 0, 0, 0, 0))

  // Calculate previous balance cutoff: find the earliest month being included in this slip.
  // If we're including catch-up months (e.g., June + July), previous dues should be before June.
  let earliestMonthYM = year * 12 + (month - 1) // Default to slip month

  // Check assignment items for the earliest month
  for (const item of dueItems) {
    if (item.billingBehavior === 'MONTHLY' && item.dueDate) {
      const itemYM = item.dueDate.getUTCFullYear() * 12 + item.dueDate.getUTCMonth()
      if (itemYM < earliestMonthYM) earliestMonthYM = itemYM
    }
  }

  // Check transport fees for the earliest month
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  for (const tf of transportFees) {
    const monthName = tf.installmentName
    const monthIndex = MONTH_NAMES.indexOf(monthName)
    if (monthIndex >= 0) {
      const tfYM = year * 12 + monthIndex
      if (tfYM < earliestMonthYM) earliestMonthYM = tfYM
    }
  }

  const earliestYear = Math.floor(earliestMonthYM / 12)
  const earliestMonth = (earliestMonthYM % 12) + 1
  const firstOfEarliestMonth = new Date(Date.UTC(earliestYear, earliestMonth - 1, 1, 0, 0, 0, 0))

  const previousBalance = await computePreviousBalance(tx, schoolId, studentId, firstOfEarliestMonth)
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

  // Add transport fees to the invoice
  for (const transportFee of transportFees) {
    const line = await tx.studentFeeInvoiceLine.create({
      data: {
        invoiceId: invoice.id,
        assignmentItemId: null, // Transport fees don't have assignment items
        feeHeadName: transportFee.feeHeadName,
        installmentName: transportFee.installmentName,
        amount: transportFee.amount,
        totalAmount: transportFee.amount,
        dueDate,
      },
    })

    // Link the existing transport debit to this invoice
    await tx.studentFeeLedgerEntry.updateMany({
      where: {
        id: transportFee.id,
        schoolId,
        studentId,
      },
      data: {
        invoiceId: invoice.id,
        invoiceLineId: line.id,
      },
    })
  }

  // Enhanced audit logging with snapshots
  await logFeeTransaction(
    tx,
    schoolId,
    'StudentFeeInvoice',
    invoice.id,
    'monthly_demand_generated',
    null, // No old value for new invoice
    invoice,
    {
      userId: generatedBy || undefined,
      metadata: {
        studentId,
        month,
        year,
        itemCount: dueItems.length + transportFees.length,
        assignmentItemCount: dueItems.length,
        transportItemCount: transportFees.length,
        subtotal,
        previousBalance,
        totalAmount,
        demandRunId: demandRunId || null,
        force: !!force,
      },
    }
  )

  return {
    status: 'created',
    invoiceId: invoice.id,
    invoiceNumber,
    totalAmount,
    subtotal,
    previousBalance,
    itemCount: dueItems.length + transportFees.length,
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
  const { schoolId, month, year, filters, generatedBy, force, dryRun, upToMonth } = args
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
          existing && force ? existing.id : null,
          upToMonth
        )
        const transportFees = await selectDueTransportFees(tx, schoolId, studentId, month, year, upToMonth)
        if (items.length === 0 && transportFees.length === 0) {
          preview.push({ studentId, itemCount: 0, subtotal: 0, previousBalance: 0, totalAmount: 0, skipReason: 'no-items' })
          skipped += 1
          continue
        }

        // Calculate previous balance cutoff based on earliest month in the slip
        let earliestMonthYM = year * 12 + (month - 1)
        const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        for (const item of items) {
          if (item.billingBehavior === 'MONTHLY' && item.dueDate) {
            const itemYM = item.dueDate.getUTCFullYear() * 12 + item.dueDate.getUTCMonth()
            if (itemYM < earliestMonthYM) earliestMonthYM = itemYM
          }
        }

        for (const tf of transportFees) {
          const monthIndex = MONTH_NAMES.indexOf(tf.installmentName)
          if (monthIndex >= 0) {
            const tfYM = year * 12 + monthIndex
            if (tfYM < earliestMonthYM) earliestMonthYM = tfYM
          }
        }

        const earliestYear = Math.floor(earliestMonthYM / 12)
        const earliestMonth = (earliestMonthYM % 12) + 1
        const firstOfEarliestMonth = new Date(Date.UTC(earliestYear, earliestMonth - 1, 1, 0, 0, 0, 0))

        const previousBalance = await computePreviousBalance(tx, schoolId, studentId, firstOfEarliestMonth)
        const assignmentSubtotal = roundMoney(items.reduce((s, i) => s + i.amount, 0))
        const transportSubtotal = roundMoney(transportFees.reduce((s, i) => s + i.amount, 0))
        const subtotal = roundMoney(assignmentSubtotal + transportSubtotal)
        const totalAmount = roundMoney(subtotal + previousBalance)
        preview.push({ studentId, itemCount: items.length + transportFees.length, subtotal, previousBalance, totalAmount })
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
                  upToMonth,
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
