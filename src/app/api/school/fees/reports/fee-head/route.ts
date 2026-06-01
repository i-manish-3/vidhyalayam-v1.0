import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'

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

    // Pull every ledger entry tagged with this head. Bounded by school size ×
    // entries-per-head — safe to tally in JS.
    const entries = await db.studentFeeLedgerEntry.findMany({
      where: {
        schoolId,
        deletedAt: null,
        feeHeadName: headName,
        ...ayFilter,
        ...(classIdFilter
          ? { student: { classId: classIdFilter } }
          : {}),
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
    })

    const inCollectionWindow = (d: Date) => {
      if (!hasDateFilter) return true
      const after = !collectionWindow.gte || d >= collectionWindow.gte
      const before = !collectionWindow.lt || d < collectionWindow.lt
      return after && before
    }

    // ── KPIs + per-class + per-student tallies in one pass ────────────
    let totalBilled = 0
    let totalCollected = 0
    let totalOutstanding = 0
    let totalRefunded = 0
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

      if (e.entryType === 'DEBIT' || e.entryType === 'FINE') {
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
      } else if (e.entryType === 'CREDIT' && inCollectionWindow(e.transactionDate)) {
        totalCollected += e.credit
        ca.collected += e.credit
        sa.collected += e.credit
      } else if (e.entryType === 'REFUND' && inCollectionWindow(e.transactionDate)) {
        totalRefunded += e.debit
      }

      classMap.set(classId, ca)
      studentMap.set(e.studentId, sa)
    }

    const byClass = Array.from(classMap.values())
      .map(c => ({
        classId: c.classId,
        className: c.className,
        billed: round2(c.billed),
        collected: round2(c.collected),
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

    // ── Monthly trend for this head (AY-scoped) ─────────────────────────
    const now = new Date()
    const yearStart = academicYearStart(academicYear) ?? new Date(now.getFullYear(), 3, 1)
    const ayEnd = new Date(yearStart.getFullYear() + 1, yearStart.getMonth(), 1)
    const monthlyMap = new Map<string, { billed: number; collected: number }>()
    const cursor = new Date(yearStart)
    while (cursor < ayEnd && cursor <= now) {
      monthlyMap.set(toMonthKey(cursor), { billed: 0, collected: 0 })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    for (const e of entries) {
      if (e.transactionDate < yearStart || e.transactionDate >= ayEnd) continue
      const key = toMonthKey(e.transactionDate)
      const bucket = monthlyMap.get(key) ?? { billed: 0, collected: 0 }
      if (e.entryType === 'DEBIT' || e.entryType === 'FINE') bucket.billed += e.debit || 0
      else if (e.entryType === 'CREDIT') bucket.collected += e.credit || 0
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
        outstanding: round2(totalOutstanding),
        refunded: round2(totalRefunded),
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

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function academicYearStart(ay?: string): Date | null {
  if (!ay) return null
  const match = ay.match(/^(\d{4})-(\d{4})$/)
  if (!match) return null
  return new Date(parseInt(match[1], 10), 3, 1)
}
