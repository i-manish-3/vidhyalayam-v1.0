import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'
import {
  toMonthKey as zonedMonthKey,
  academicYearStart as zonedAcademicYearStart,
  academicYearStartFor,
  addZonedMonths,
} from '@/lib/zoned-time'

/**
 * GET /api/school/fees/reports/fee-head
 *
 * Deep-dive for a single fee head. Returns:
 *   - KPIs for the head: billed, collected, outstanding, refunded,
 *     collectionRate, studentsBilled, defaulterCount
 *   - byClass[]: billed/collected/outstanding + defaulter count for each class
 *     that has activity in this head
 *   - topDefaulters[]: students with the largest open balance on this head
 *     (capped at `limit`, default 100)
 *   - monthlySeries[]: AY-scoped billed-vs-collected per month
 *
 * Query params:
 *   headName     — REQUIRED, matches StudentFeeLedgerEntry.feeHeadName
 *   academicYear — optional
 *   startDate    — optional, bounds the "collected" window
 *   endDate      — optional
 *   classId      — optional filter
 *   limit        — defaulter cap (default 100, max 500)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'fees:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view fee reports.")
    }
    const schoolId = user.schoolId

    const { searchParams } = new URL(request.url)
    const headName = searchParams.get('headName')?.trim()
    if (!headName) {
      return apiError(400, 'headName is required')
    }
    const academicYear = searchParams.get('academicYear') || undefined
    const classIdFilter = searchParams.get('classId') || undefined
    const startParam = searchParams.get('startDate')
    const endParam = searchParams.get('endDate')
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)))

    const ayFilter = academicYear ? { academicYear } : {}
    const collectionWindow: { gte?: Date; lt?: Date } = {}
    if (startParam) collectionWindow.gte = new Date(startParam)
    if (endParam) collectionWindow.lt = new Date(endParam)
    const hasDateFilter = collectionWindow.gte || collectionWindow.lt

    // Student scope includes inactive/withdrawn students so totals reconcile with
    // the summary KPIs (all-students). Only an optional class filter is applied.
    const studentScopeFilter = classIdFilter ? { classId: classIdFilter } : undefined

    // School timezone for month bucketing.
    const school = await db.school.findUnique({ where: { id: schoolId }, select: { timezone: true } })
    const timezone = school?.timezone || 'Asia/Kolkata'

    // Pull every ledger entry tagged with this head. Bounded by school size ×
    // entries-per-head — safe to tally in JS.
    const [entries, allocations] = await Promise.all([
      db.studentFeeLedgerEntry.findMany({
        where: {
          schoolId,
          deletedAt: null,
          status: { not: 'cancelled' },
          entryType: { in: ['DEBIT', 'FINE'] },
          feeHeadName: headName,
          ...ayFilter,
          student: studentScopeFilter,
        },
        select: {
          studentId: true,
          entryType: true,
          debit: true,
          credit: true,
          balanceAmount: true,
          status: true,
          transactionDate: true,
          dueDate: true,
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
        },
      }),
      db.studentFeeLedgerAllocation.findMany({
        where: {
          schoolId,
          deletedAt: null,
          ...(hasDateFilter ? { allocatedAt: collectionWindow } : {}),
          creditEntry: {
            entryType: { in: ['CREDIT', 'WAIVER'] },
            deletedAt: null,
          },
          debitEntry: {
            schoolId,
            deletedAt: null,
            status: { not: 'cancelled' },
            feeHeadName: headName,
            ...ayFilter,
            student: studentScopeFilter,
          },
        },
        select: {
          amount: true,
          allocatedAt: true,
          creditEntry: { select: { entryType: true } },
          debitEntry: {
            select: {
              studentId: true,
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
            },
          },
        },
      }),
    ])

    // ── KPIs + per-class + per-student tallies in one pass ────────────
    let totalBilled = 0
    let totalCollected = 0
    let totalWaived = 0
    let totalOutstanding = 0
    const studentsBilled = new Set<string>()

    const classMap = new Map<string, ClassRow>()
    const studentMap = new Map<string, StudentRow>()

    for (const e of entries) {
      const cls = e.student.class
      const classId = cls?.id ?? '__none__'
      const className = cls?.name ?? 'Unassigned'

      const ca = classMap.get(classId) ?? {
        classId,
        className,
        billed: 0,
        collected: 0,
        waived: 0,
        outstanding: 0,
        defaulterIds: new Set<string>(),
        studentIds: new Set<string>(),
      }
      ca.studentIds.add(e.studentId)

      const sa = studentMap.get(e.studentId) ?? {
        studentId: e.studentId,
        name: `${e.student.firstName} ${e.student.lastName}`.trim(),
        admissionNumber: e.student.admissionNumber,
        rollNumber: e.student.rollNumber,
        class: e.student.class,
        section: e.student.section,
        billed: 0,
        collected: 0,
        outstanding: 0,
        oldestDueDate: null as Date | null,
      }

      totalBilled += e.debit
      ca.billed += e.debit
      sa.billed += e.debit
      studentsBilled.add(e.studentId)
      if (e.status === 'open' || e.status === 'partial') {
        const bal = e.balanceAmount || 0
        totalOutstanding += bal
        ca.outstanding += bal
        sa.outstanding += bal
        ca.defaulterIds.add(e.studentId)
        const due = e.dueDate ?? e.transactionDate
        if (!sa.oldestDueDate || (due && due < sa.oldestDueDate)) {
          sa.oldestDueDate = due
        }
      }

      classMap.set(classId, ca)
      studentMap.set(e.studentId, sa)
    }

    for (const allocation of allocations) {
      const debit = allocation.debitEntry
      const student = debit.student
      const cls = student.class
      const classId = cls?.id ?? '__none__'
      const className = cls?.name ?? 'Unassigned'
      const amount = allocation.amount || 0

      const isWaiver = allocation.creditEntry.entryType === 'WAIVER'

      const ca = classMap.get(classId) ?? {
        classId,
        className,
        billed: 0,
        collected: 0,
        waived: 0,
        outstanding: 0,
        defaulterIds: new Set<string>(),
        studentIds: new Set<string>(),
      }
      ca.studentIds.add(debit.studentId)
      if (isWaiver) ca.waived += amount
      else ca.collected += amount

      const sa = studentMap.get(debit.studentId) ?? {
        studentId: debit.studentId,
        name: `${student.firstName} ${student.lastName}`.trim(),
        admissionNumber: student.admissionNumber,
        rollNumber: student.rollNumber,
        class: student.class,
        section: student.section,
        billed: 0,
        collected: 0,
        outstanding: 0,
        oldestDueDate: null as Date | null,
      }
      if (isWaiver) {
        totalWaived += amount
      } else {
        sa.collected += amount
        totalCollected += amount
      }

      classMap.set(classId, ca)
      studentMap.set(debit.studentId, sa)
    }

    const byClass = Array.from(classMap.values())
      .map(c => ({
        classId: c.classId,
        className: c.className,
        billed: round2(c.billed),
        collected: round2(c.collected),
        waived: round2(c.waived),
        outstanding: round2(c.outstanding),
        studentCount: c.studentIds.size,
        defaulterCount: c.defaulterIds.size,
        collectionRate: c.billed > 0 ? Number(((c.collected / c.billed) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.outstanding - a.outstanding || b.billed - a.billed)

    const topDefaulters = Array.from(studentMap.values())
      .filter(s => s.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, limit)
      .map(s => ({
        studentId: s.studentId,
        name: s.name,
        admissionNumber: s.admissionNumber,
        rollNumber: s.rollNumber,
        class: s.class,
        section: s.section,
        billed: round2(s.billed),
        collected: round2(s.collected),
        outstanding: round2(s.outstanding),
        oldestDueDate: s.oldestDueDate?.toISOString() ?? null,
      }))

    // ── Monthly trend for this head (AY-scoped, school timezone) ────────
    const now = new Date()
    const yearStart = zonedAcademicYearStart(academicYear, timezone) ?? academicYearStartFor(now, timezone)
    const ayEnd = addZonedMonths(yearStart, 12, timezone)
    const monthlyMap = new Map<string, { billed: number; collected: number }>()
    let cursor = new Date(yearStart)
    while (cursor < ayEnd && cursor <= now) {
      monthlyMap.set(zonedMonthKey(cursor, timezone), { billed: 0, collected: 0 })
      cursor = addZonedMonths(cursor, 1, timezone)
    }
    for (const e of entries) {
      if (e.transactionDate < yearStart || e.transactionDate >= ayEnd) continue
      const key = zonedMonthKey(e.transactionDate, timezone)
      const bucket = monthlyMap.get(key) ?? { billed: 0, collected: 0 }
      bucket.billed += e.debit || 0
      monthlyMap.set(key, bucket)
    }
    for (const allocation of allocations) {
      if (allocation.creditEntry.entryType === 'WAIVER') continue
      if (allocation.allocatedAt < yearStart || allocation.allocatedAt >= ayEnd) continue
      const key = zonedMonthKey(allocation.allocatedAt, timezone)
      const bucket = monthlyMap.get(key) ?? { billed: 0, collected: 0 }
      bucket.collected += allocation.amount || 0
      monthlyMap.set(key, bucket)
    }
    const monthlySeries = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        billed: round2(v.billed),
        collected: round2(v.collected),
      }))

    const defaulterCount = Array.from(studentMap.values()).filter(s => s.outstanding > 0).length

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      headName,
      kpis: {
        billed: round2(totalBilled),
        collected: round2(totalCollected),
        waived: round2(totalWaived),
        outstanding: round2(totalOutstanding),
        collectionRate: totalBilled > 0
          ? Number(((totalCollected / totalBilled) * 100).toFixed(1))
          : 0,
        studentsBilled: studentsBilled.size,
        defaulterCount,
      },
      byClass,
      topDefaulters,
      monthlySeries,
      defaultersTruncated: defaulterCount > topDefaulters.length,
    })
  } catch (error) {
    console.error('Fee-head deep-dive error:', error)
    return internalError('loading fee head detail')
  }
}

interface ClassRow {
  classId: string
  className: string
  billed: number
  collected: number
  waived: number
  outstanding: number
  defaulterIds: Set<string>
  studentIds: Set<string>
}

interface StudentRow {
  studentId: string
  name: string
  admissionNumber: string | null
  rollNumber: string | null
  class: { id: string; name: string } | null
  section: { id: string; name: string } | null
  billed: number
  collected: number
  outstanding: number
  oldestDueDate: Date | null
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
