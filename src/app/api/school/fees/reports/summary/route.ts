import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'
import { getFeeLedgerSummary } from '@/lib/fee-ledger-summary'

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
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const yearStart = academicYearStart(academicYear) ?? new Date(now.getFullYear(), 3, 1) // Apr 1

    const seriesStart = startParam ? new Date(startParam) : new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000)
    const seriesEnd = endParam ? new Date(endParam) : todayEnd

    const academicYearFilter = academicYear ? { academicYear } : {}
    const debitAcademicYearFilter = academicYear ? { academicYear } : {}

    // ── KPIs ───────────────────────────────────────────────────────────
    const ledgerSummary = await getFeeLedgerSummary(schoolId, undefined, academicYear)

    const [
      todayCredits,
      monthCredits,
      yearCredits,
      refundDebits,
      todayReceipts,
      paymentMethodAgg,
      activeStudents,
    ] = await Promise.all([
      db.studentFeeLedgerAllocation.aggregate({
        where: {
          schoolId, deletedAt: null,
          allocatedAt: { gte: todayStart, lt: todayEnd },
          creditEntry: { entryType: 'CREDIT', deletedAt: null },
          debitEntry: { deletedAt: null, ...debitAcademicYearFilter },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      db.studentFeeLedgerAllocation.aggregate({
        where: {
          schoolId, deletedAt: null,
          allocatedAt: { gte: monthStart, lt: todayEnd },
          creditEntry: { entryType: 'CREDIT', deletedAt: null },
          debitEntry: { deletedAt: null, ...debitAcademicYearFilter },
        },
        _sum: { amount: true },
      }),
      db.studentFeeLedgerAllocation.aggregate({
        where: {
          schoolId, deletedAt: null,
          allocatedAt: { gte: yearStart, lt: todayEnd },
          creditEntry: { entryType: 'CREDIT', deletedAt: null },
          debitEntry: { deletedAt: null, ...debitAcademicYearFilter },
        },
        _sum: { amount: true },
      }),
      // Refunds are DEBIT entries with sourceType='refund'
      db.studentFeeLedgerEntry.aggregate({
        where: {
          schoolId, deletedAt: null, entryType: 'REFUND',
          transactionDate: { gte: yearStart, lt: todayEnd },
        },
        _sum: { debit: true },
        _count: { id: true },
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
          debitEntry: { deletedAt: null, ...debitAcademicYearFilter },
        },
        select: {
          amount: true,
          creditEntry: { select: { paymentMethod: true } },
        },
      }),
      db.student.count({ where: { schoolId, isActive: true, deletedAt: null } }),
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
        debitEntry: { deletedAt: null, ...debitAcademicYearFilter },
      },
      select: { allocatedAt: true, amount: true },
    })

    const dailyMap = new Map<string, { amount: number; count: number }>()
    // Pre-seed every day in the range with zero so the chart shows gaps as zero, not absent
    for (let d = new Date(seriesStart); d < seriesEnd; d.setDate(d.getDate() + 1)) {
      dailyMap.set(toDateKey(d), { amount: 0, count: 0 })
    }
    for (const row of credits) {
      const key = toDateKey(row.allocatedAt)
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
      const method = row.creditEntry.paymentMethod || 'UNSPECIFIED'
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
    const ayEndForTrend = new Date(yearStart.getFullYear() + 1, yearStart.getMonth(), 1)
    const monthlyEntries = await db.studentFeeLedgerEntry.findMany({
      where: {
        schoolId, deletedAt: null,
        entryType: { in: ['DEBIT', 'FINE'] },
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
        debitEntry: { deletedAt: null, ...debitAcademicYearFilter },
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
    const cursor = new Date(yearStart)
    while (cursor < ayEndForTrend && cursor <= now) {
      monthlyMap.set(toMonthKey(cursor), { billed: 0, collected: 0 })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    for (const row of monthlyEntries) {
      const key = toMonthKey(row.transactionDate)
      const bucket = monthlyMap.get(key) ?? { billed: 0, collected: 0 }
      if (row.entryType === 'DEBIT' || row.entryType === 'FINE') bucket.billed += row.debit || 0
      monthlyMap.set(key, bucket)
    }
    for (const row of monthlyAllocations) {
      const key = toMonthKey(row.allocatedAt)
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

    const serviceMap = new Map<ServiceKey, ServiceAgg>(
      SERVICE_ORDER.map(key => [
        key,
        { key, label: SERVICE_LABELS[key], billed: 0, collected: 0, outstanding: 0 },
      ])
    )
    for (const row of monthlyEntries) {
      const serviceKey = getServiceKey(row.sourceType, row.feeHeadName)
      const bucket = serviceMap.get(serviceKey)!
      if (row.entryType === 'DEBIT' || row.entryType === 'FINE') {
        bucket.billed += row.debit || 0
        if (row.status === 'open' || row.status === 'partial') {
          bucket.outstanding += row.balanceAmount || 0
        }
      }
      serviceMap.set(serviceKey, bucket)
    }
    for (const row of monthlyAllocations) {
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
        refundsIssued: round2(refundDebits._sum.debit || 0),
        refundCount: refundDebits._count.id,
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

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

function academicYearStart(ay?: string): Date | null {
  if (!ay) return null
  const match = ay.match(/^(\d{4})-(\d{4})$/)
  if (!match) return null
  // Indian AY: April 1st of the start year
  return new Date(parseInt(match[1], 10), 3, 1)
}
