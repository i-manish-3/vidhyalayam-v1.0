import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'
import { startOfZonedDay, addZonedDays } from '@/lib/zoned-time'

/**
 * GET /api/school/fees/reports/daily-register
 *
 * Day-end collection register — every receipt collected on a given day, with the
 * student, fee heads covered, amount and mode. Plus mode-wise totals for the
 * cashier's closing reconciliation. Receipts are CREDIT ledger entries; the fee
 * heads come from each receipt's allocations.
 *
 * Query params:
 *   date   (ISO date) — the day to report on (school timezone). Default: today.
 *   mode   — optional payment-method filter (CASH, UPI, …, ADJUSTMENT)
 *   classId — optional class filter
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'fees:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view fee reports.")
    }
    const schoolId = user.schoolId

    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const modeFilter = searchParams.get('mode') || undefined
    const classIdFilter = searchParams.get('classId') || undefined
    // 'fees' | 'store' | undefined(all) — fee/store cash share one ledger; this
    // splits them by the underlying charge's sourceType.
    const sourceFilter = searchParams.get('source') || undefined

    const includeSchool = searchParams.get('forPrint') === '1'
    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: {
        timezone: true, name: true, logo: true, printHeader: true,
        address: true, city: true, state: true, pincode: true,
        contactPhone: true, contactEmail: true, website: true, board: true,
      },
    })
    const timezone = school?.timezone || 'Asia/Kolkata'

    const anchor = dateParam ? new Date(dateParam) : new Date()
    if (isNaN(anchor.getTime())) return apiError(400, 'Invalid date parameter')
    const dayStart = startOfZonedDay(anchor, timezone)
    const dayEnd = addZonedDays(dayStart, 1, timezone)

    // Receipts = CREDIT entries within the day. Each may have several allocations
    // (one per fee head it was applied to).
    const receipts = await db.studentFeeLedgerEntry.findMany({
      where: {
        schoolId,
        deletedAt: null,
        entryType: 'CREDIT',
        transactionDate: { gte: dayStart, lt: dayEnd },
        ...(classIdFilter ? { student: { schoolId, classId: classIdFilter } } : {}),
      },
      select: {
        id: true,
        credit: true,
        balanceAmount: true,
        paymentMethod: true,
        transactionDate: true,
        receiptNumber: true,
        transactionRef: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            rollNumber: true,
            class: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
          },
        },
        creditAllocations: {
          where: { deletedAt: null },
          select: {
            amount: true,
            debitEntry: { select: { feeHeadName: true, sourceType: true } },
          },
        },
      },
      orderBy: { transactionDate: 'asc' },
    })

    const rows = receipts
      .map((r) => {
        const isAdjustment = (r.receiptNumber || '').startsWith('ADJ-')
        // Normalise casing: fees store 'CASH', inventory stores 'cash' — same mode.
        const mode = isAdjustment ? 'ADJUSTMENT' : (r.paymentMethod || 'UNSPECIFIED').toUpperCase()
        // Sum allocations per fee head + tally how much went to store vs fees.
        const headMap = new Map<string, number>()
        let storeAmt = 0
        let feesAmt = 0
        for (const a of r.creditAllocations) {
          const head = a.debitEntry.feeHeadName || 'Other'
          const amt = a.amount || 0
          headMap.set(head, (headMap.get(head) ?? 0) + amt)
          if (a.debitEntry.sourceType === 'inventory') storeAmt += amt
          else feesAmt += amt
        }
        const heads = Array.from(headMap.entries())
          .map(([name, amount]) => ({ name, amount: round2(amount) }))
          .sort((a, b) => b.amount - a.amount)
        const allocated = storeAmt + feesAmt
        // A receipt is one transaction (a fee payment or a store sale); tag it by
        // which side its allocations went to. Unapplied (advance) counts as fees.
        const source: 'fees' | 'store' = storeAmt > feesAmt ? 'store' : 'fees'
        return {
          receiptNumber: r.receiptNumber,
          time: r.transactionDate.toISOString(),
          mode,
          source,
          amount: round2(r.credit),
          // Portion of this receipt not yet applied to any due (sits as advance).
          unapplied: round2(Math.max(0, (r.credit || 0) - allocated)),
          reference: r.transactionRef,
          student: {
            id: r.student.id,
            name: `${r.student.firstName} ${r.student.lastName || ''}`.trim(),
            admissionNumber: r.student.admissionNumber,
            rollNumber: r.student.rollNumber,
            className: r.student.class?.name ?? null,
            sectionName: r.student.section?.name ?? null,
          },
          heads,
        }
      })
      .filter((row) => !modeFilter || row.mode === modeFilter)
      .filter((row) => !sourceFilter || row.source === sourceFilter)

    // Mode-wise totals for cashier closing (with fee/store split per mode).
    const modeMap = new Map<string, { amount: number; count: number; fees: number; store: number }>()
    for (const row of rows) {
      const b = modeMap.get(row.mode) ?? { amount: 0, count: 0, fees: 0, store: 0 }
      b.amount += row.amount
      b.count += 1
      if (row.source === 'store') b.store += row.amount
      else b.fees += row.amount
      modeMap.set(row.mode, b)
    }
    const modeTotals = Array.from(modeMap.entries())
      .map(([mode, v]) => ({ mode, amount: round2(v.amount), count: v.count, fees: round2(v.fees), store: round2(v.store) }))
      .sort((a, b) => b.amount - a.amount)

    const grandTotal = round2(rows.reduce((s, r) => s + r.amount, 0))
    const feesTotal = round2(rows.filter((r) => r.source === 'fees').reduce((s, r) => s + r.amount, 0))
    const storeTotal = round2(rows.filter((r) => r.source === 'store').reduce((s, r) => s + r.amount, 0))

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      date: dayStart.toISOString(),
      timezone,
      ...(includeSchool && school
        ? {
            school: {
              name: school.name, logo: school.logo, printHeader: school.printHeader,
              address: school.address, city: school.city, state: school.state,
              pincode: school.pincode, contactPhone: school.contactPhone,
              contactEmail: school.contactEmail, website: school.website, board: school.board,
            },
          }
        : {}),
      rows,
      modeTotals,
      grandTotal,
      feesTotal,
      storeTotal,
      receiptCount: rows.length,
    })
  } catch (error) {
    console.error('Daily register error:', error)
    return internalError('loading daily collection register')
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
