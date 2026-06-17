import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'
import { getFeeLedgerSummary } from '@/lib/fee-ledger-summary'
import {
  getZonedParts, startOfZonedDay, startOfZonedMonth, addZonedDays, addZonedMonths,
  toDateKey, toMonthKey, academicYearStart, academicYearStartFor,
} from '@/lib/zoned-time'

/**
 * GET /api/school/fees/reports/summary
 *
 * Returns KPIs + daily series + payment mode breakdown for the Fee Reports
 * dashboard's Summary tab.
 *
 * Query params:
 *   startDate (ISO date) — inclusive lower bound for the daily series / scoped KPIs
 *   endDate   (ISO date) — inclusive upper bound
 *   academicYear         — optional filter (matches ledger entries' academicYear)
 *
 * Source of truth is StudentFeeLedgerEntry. CREDIT rows are receipts; DEBIT rows
 * are billings. Outstanding = sum(balanceAmount) on open/partial debits.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'fees:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view fee reports.")
    }
    const schoolId = user.schoolId

    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get('startDate')
    const endParam = searchParams.get('endDate')
    const academicYear = searchParams.get('academicYear') || undefined

    // Default range: last 30 days, ending today
    const now = new Date()
    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { timezone: true },
    })
    const timezone = school?.timezone || 'Asia/Kolkata'
    const todayStart = startOfZonedDay(now, timezone)
    const todayEnd = addZonedDays(todayStart, 1, timezone)
    const monthStart = startOfZonedMonth(now, timezone)
    const yearStart = academicYearStart(academicYear, timezone) ?? academicYearStartFor(now, timezone)

    const seriesStart = startParam ? new Date(startParam) : addZonedDays(todayStart, -29, timezone)
    const seriesEnd = endParam ? new Date(endParam) : todayEnd

    const academicYearFilter = academicYear ? { academicYear } : {}

    // ── KPIs ───────────────────────────────────────────────────────────
    const ledgerSummary = await getFeeLedgerSummary(schoolId, undefined, academicYear)

    const [
      todayCredits,
      monthCredits,
      yearCredits,
      todayReceipts,
      paymentMethodAgg,
      activeStudents,
      refundEventCounts,
    ] = await Promise.all([
      db.studentFeeLedgerAllocation.aggregate({
        where: {
          schoolId, deletedAt: null,
          allocatedAt: { gte: todayStart, lt: todayEnd },
          creditEntry: { entryType: 'CREDIT', deletedAt: null },
          debitEntry: { deletedAt: null, status: { not: 'cancelled' }, ...academicYearFilter },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      db.studentFeeLedgerAllocation.aggregate({
        where: {
          schoolId, deletedAt: null,
          allocatedAt: { gte: monthStart, lt: todayEnd },
          creditEntry: { entryType: 'CREDIT', deletedAt: null },
          debitEntry: { deletedAt: null, status: { not: 'cancelled' }, ...academicYearFilter },
        },
        _sum: { amount: true },
      }),
      db.studentFeeLedgerAllocation.aggregate({
        where: {
          schoolId, deletedAt: null,
          allocatedAt: { gte: yearStart, lt: todayEnd },
          creditEntry: { entryType: 'CREDIT', deletedAt: null },
          debitEntry: { deletedAt: null, status: { not: 'cancelled' }, ...academicYearFilter },
        },
        _sum: { amount: true },
      }),
      db.studentFeePayment.count({
        where: {
          schoolId,
          paymentDate: { gte: todayStart, lt: todayEnd },
        },
      }),
      // Payment method breakdown over [seriesStart, seriesEnd]
      db.studentFeeLedgerAllocation.findMany({
        where: {
          schoolId, deletedAt: null,
          allocatedAt: { gte: seriesStart, lt: seriesEnd },
          creditEntry: { entryType: 'CREDIT', deletedAt: null },
          debitEntry: { deletedAt: null, status: { not: 'cancelled' }, ...academicYearFilter },
        },
        select: {
          amount: true,
          receiptNumber: true,
          creditEntry: { select: { paymentMethod: true } },
        },
      }),
      db.student.count({ where: { schoolId, isActive: true, deletedAt: null } }),
      // Count of cash-refund events in the year (for the refunds KPI sub-line)
      Promise.all([
        db.transportEvent.count({
          where: {
            schoolId, eventType: 'WITHDRAWN', refundMode: 'cash',
            refundStatus: { in: ['pending', 'settled'] },
            createdAt: { gte: yearStart, lt: todayEnd },
            ...academicYearFilter,
          },
        }),
        db.hostelEvent.count({
          where: {
            schoolId, eventType: 'WITHDRAWN', refundMode: 'cash',
            refundStatus: { in: ['pending', 'settled'] },
            createdAt: { gte: yearStart, lt: todayEnd },
            ...academicYearFilter,
          },
        }),
      ]).then(([t, h]) => t + h),
    ])

    // ── Daily series ─────────────────────────────────────────────────────
    // Group by date(transactionDate) — Postgres supports raw queries, but
    // a single fetch + JS bucket is portable and the row count is tiny
    // (one receipt per ledger CREDIT, typically <few hundred per month).
    const credits = await db.studentFeeLedgerAllocation.findMany({
      where: {
        schoolId, deletedAt: null,
        allocatedAt: { gte: seriesStart, lt: seriesEnd },
        creditEntry: { entryType: 'CREDIT', deletedAt: null },
        debitEntry: { deletedAt: null, status: { not: 'cancelled' }, ...academicYearFilter },
      },
      select: { allocatedAt: true, amount: true },
    })

    const dailyMap = new Map<string, { amount: number; count: number }>()
    // Pre-seed every day in the range with zero so the chart shows gaps as zero, not absent
    for (let d = startOfZonedDay(seriesStart, timezone); d < seriesEnd; d = addZonedDays(d, 1, timezone)) {
      dailyMap.set(toDateKey(d, timezone), { amount: 0, count: 0 })
    }
    for (const row of credits) {
      const key = toDateKey(row.allocatedAt, timezone)
      const bucket = dailyMap.get(key) ?? { amount: 0, count: 0 }
      bucket.amount += row.amount || 0
      bucket.count += 1
      dailyMap.set(key, bucket)
    }
    const dailySeries = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, amount: round2(v.amount), count: v.count }))

    const paymentModeMap = new Map<string, { amount: number; count: number }>()
    for (const row of paymentMethodAgg) {
      // Advance applied to dues (receiptNumber 'ADJ-…') moves no real cash, so it
      // is bucketed as ADJUSTMENT rather than inflating CASH/UPI/etc.
      const isAdjustment = (row.receiptNumber || '').startsWith('ADJ-')
      // Normalise casing: fees store 'CASH', inventory stores 'cash' — same mode.
      const method = isAdjustment ? 'ADJUSTMENT' : (row.creditEntry.paymentMethod || 'UNSPECIFIED').toUpperCase()
      const bucket = paymentModeMap.get(method) ?? { amount: 0, count: 0 }
      bucket.amount += row.amount || 0
      bucket.count += 1
      paymentModeMap.set(method, bucket)
    }
    const paymentModeBreakdown = Array.from(paymentModeMap.entries())
      .map(([method, row]) => ({
        method,
        amount: round2(row.amount),
        count: row.count,
      }))
      .sort((a, b) => b.amount - a.amount)

    // ── Monthly trend (AY-scoped) ───────────────────────────────────────
    // Bill vs collected per month from AY-start through the month containing
    // `now`. Pre-seeded so months with zero activity still render as bars.
    // Runs as two extra fetches (debits + credits) scoped to AY; row count
    // stays bounded by school size × ~12 months.
    const ayEndForTrend = addZonedMonths(yearStart, 12, timezone)
    const monthlyEntries = await db.studentFeeLedgerEntry.findMany({
      where: {
        schoolId, deletedAt: null,
        entryType: { in: ['DEBIT', 'FINE'] },
        status: { not: 'cancelled' },
        transactionDate: { gte: yearStart, lt: ayEndForTrend },
        ...academicYearFilter,
      },
      select: {
        transactionDate: true,
        debit: true,
        credit: true,
        entryType: true,
        balanceAmount: true,
        status: true,
        feeHeadName: true,
        sourceType: true,
      },
    })
    const monthlyAllocations = await db.studentFeeLedgerAllocation.findMany({
      where: {
        schoolId, deletedAt: null,
        allocatedAt: { gte: yearStart, lt: ayEndForTrend },
        creditEntry: { entryType: 'CREDIT', deletedAt: null },
        debitEntry: { deletedAt: null, status: { not: 'cancelled' }, ...academicYearFilter },
      },
      select: {
        amount: true,
        allocatedAt: true,
        debitEntry: {
          select: {
            sourceType: true,
            feeHeadName: true,
          },
        },
      },
    })

    const monthlyMap = new Map<string, { billed: number; collected: number }>()
    // Pre-seed every month from AY start up to current month inclusive
    let cursor = new Date(yearStart)
    while (cursor < ayEndForTrend && cursor <= now) {
      monthlyMap.set(toMonthKey(cursor, timezone), { billed: 0, collected: 0 })
      cursor = addZonedMonths(cursor, 1, timezone)
    }
    for (const row of monthlyEntries) {
      const key = toMonthKey(row.transactionDate, timezone)
      const bucket = monthlyMap.get(key) ?? { billed: 0, collected: 0 }
      if (row.entryType === 'DEBIT' || row.entryType === 'FINE') bucket.billed += row.debit || 0
      monthlyMap.set(key, bucket)
    }
    for (const row of monthlyAllocations) {
      const key = toMonthKey(row.allocatedAt, timezone)
      const bucket = monthlyMap.get(key) ?? { billed: 0, collected: 0 }
      bucket.collected += row.amount || 0
      monthlyMap.set(key, bucket)
    }
    const monthlySeries = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        billed: round2(v.billed),
        collected: round2(v.collected),
      }))

    // Service breakdown is scoped all-time-within-AY (not transactionDate-windowed)
    // so its Billed/Outstanding totals reconcile with the top-line KPIs.
    const [serviceEntries, serviceAllocations] = await Promise.all([
      db.studentFeeLedgerEntry.findMany({
        where: {
          schoolId, deletedAt: null,
          entryType: { in: ['DEBIT', 'FINE'] },
          status: { not: 'cancelled' },
          ...academicYearFilter,
        },
        select: {
          debit: true, balanceAmount: true, status: true,
          sourceType: true, feeHeadName: true,
        },
      }),
      db.studentFeeLedgerAllocation.findMany({
        where: {
          schoolId, deletedAt: null,
          creditEntry: { entryType: 'CREDIT', deletedAt: null },
          debitEntry: { deletedAt: null, status: { not: 'cancelled' }, ...academicYearFilter },
        },
        select: {
          amount: true,
          debitEntry: { select: { sourceType: true, feeHeadName: true } },
        },
      }),
    ])

    const serviceMap = new Map<ServiceKey, ServiceAgg>(
      SERVICE_ORDER.map(key => [
        key,
        { key, label: SERVICE_LABELS[key], billed: 0, collected: 0, outstanding: 0 },
      ])
    )
    for (const row of serviceEntries) {
      const serviceKey = getServiceKey(row.sourceType, row.feeHeadName)
      const bucket = serviceMap.get(serviceKey)!
      bucket.billed += row.debit || 0
      if (row.status === 'open' || row.status === 'partial') {
        bucket.outstanding += row.balanceAmount || 0
      }
      serviceMap.set(serviceKey, bucket)
    }
    for (const row of serviceAllocations) {
      const serviceKey = getServiceKey(row.debitEntry.sourceType, row.debitEntry.feeHeadName)
      const bucket = serviceMap.get(serviceKey)!
      bucket.collected += row.amount || 0
      serviceMap.set(serviceKey, bucket)
    }
    const serviceBreakdown = SERVICE_ORDER.map(key => {
      const service = serviceMap.get(key)!
      return {
        service: service.key,
        label: service.label,
        billed: round2(service.billed),
        collected: round2(service.collected),
        outstanding: round2(service.outstanding),
        collectionRate: service.billed > 0
          ? Number(((service.collected / service.billed) * 100).toFixed(1))
          : 0,
      }
    })

    return NextResponse.json({
      generatedAt: now.toISOString(),
      range: {
        startDate: seriesStart.toISOString(),
        endDate: seriesEnd.toISOString(),
      },
      kpis: {
        todayCollected: round2(todayCredits._sum.amount || 0),
        todayReceiptCount: todayReceipts,
        monthCollected: round2(monthCredits._sum.amount || 0),
        yearCollected: round2(yearCredits._sum.amount || 0),
        outstanding: round2(ledgerSummary.pending),
        overdue: round2(ledgerSummary.overdue),
        totalBilled: round2(ledgerSummary.total),
        totalCollected: round2(ledgerSummary.collected),
        waived: round2(ledgerSummary.waived),
        refundsIssued: round2(ledgerSummary.refunded),
        refundCount: refundEventCounts,
        collectionRate: ledgerSummary.total > 0
          ? Number(((ledgerSummary.collected / ledgerSummary.total) * 100).toFixed(1))
          : 0,
        activeStudents,
      },
      dailySeries,
      monthlySeries,
      serviceBreakdown,
      paymentModeBreakdown,
    })
  } catch (error) {
    console.error('Fee summary report error:', error)
    return internalError('loading fee summary')
  }
}

type ServiceKey = 'fees' | 'transport' | 'hostel'

interface ServiceAgg {
  key: ServiceKey
  label: string
  billed: number
  collected: number
  outstanding: number
}

const SERVICE_ORDER: ServiceKey[] = ['fees', 'transport', 'hostel']

const SERVICE_LABELS: Record<ServiceKey, string> = {
  fees: 'Academic Fees',
  transport: 'Transport',
  hostel: 'Hostel',
}

function getServiceKey(sourceType?: string | null, feeHeadName?: string | null): ServiceKey {
  const source = (sourceType || '').toLowerCase()
  const head = (feeHeadName || '').toLowerCase()

  if (source === 'hostel' || head.includes('hostel')) return 'hostel'
  if (source === 'transport' || head.includes('transport')) return 'transport'
  return 'fees'
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
