import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'

/**
 * GET /api/school/fees/reports/outstanding
 *
 * Returns students with open balances bucketed by aging.
 * Source of truth: StudentFeeLedgerEntry where entryType='DEBIT',
 * status in (open, partial), balanceAmount > 0.
 *
 * Query params:
 *   classId        — filter by class
 *   sectionId      — filter by section
 *   academicYear   — filter by AY
 *   minAmount      — only show students owing at least this
 *   bucket         — '0_30' | '31_60' | '61_90' | '90_plus' | 'all'
 *   search         — match against student name or admission number
 *   page, limit    — pagination
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'fees:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view fee reports.")
    }
    const schoolId = user.schoolId

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId') || undefined
    const sectionId = searchParams.get('sectionId') || undefined
    const academicYear = searchParams.get('academicYear') || undefined
    const minAmount = Number(searchParams.get('minAmount')) || 0
    const bucket = searchParams.get('bucket') || 'all'
    const search = searchParams.get('search')?.trim() || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))

    // Pull every open debit for this school. Per-school counts make this
    // safe to load in one shot (debits cap at ~assignment items × students).
    const openDebits = await db.studentFeeLedgerEntry.findMany({
      where: {
        schoolId,
        deletedAt: null,
        entryType: 'DEBIT',
        status: { in: ['open', 'partial'] },
        balanceAmount: { gt: 0 },
        ...(academicYear ? { academicYear } : {}),
      },
      select: {
        studentId: true,
        balanceAmount: true,
        dueDate: true,
        transactionDate: true,
        feeHeadName: true,
      },
    })

    if (openDebits.length === 0) {
      return NextResponse.json({
        rows: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        totals: { studentCount: 0, outstanding: 0, buckets: emptyBuckets() },
      })
    }

    // Group by studentId, build aging buckets
    const today = stripTime(new Date())
    const byStudent = new Map<string, StudentBuckets>()
    for (const d of openDebits) {
      const due = d.dueDate ?? d.transactionDate
      const ageDays = Math.floor((today.getTime() - stripTime(due).getTime()) / (24 * 60 * 60 * 1000))
      const bal = d.balanceAmount || 0

      const bk = byStudent.get(d.studentId) ?? createBuckets()
      bk.total += bal
      if (ageDays <= 0) bk.notDue += bal
      else if (ageDays <= 30) bk.b0_30 += bal
      else if (ageDays <= 60) bk.b31_60 += bal
      else if (ageDays <= 90) bk.b61_90 += bal
      else bk.b90_plus += bal

      if (!bk.oldestDueDate || (due && due < bk.oldestDueDate)) {
        bk.oldestDueDate = due
      }
      byStudent.set(d.studentId, bk)
    }

    const studentIds = Array.from(byStudent.keys())

    // Fetch student rows (filterable + searchable)
    const students = await db.student.findMany({
      where: {
        id: { in: studentIds },
        schoolId,
        deletedAt: null,
        ...(classId ? { classId } : {}),
        ...(sectionId ? { sectionId } : {}),
        ...(search ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { admissionNumber: { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        rollNumber: true,
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
      },
    })

    // Latest payment per student (for "last payment" column)
    const lastPayments = await db.studentFeePayment.groupBy({
      by: ['studentId'],
      where: { schoolId, studentId: { in: studentIds } },
      _max: { paymentDate: true },
    })
    const lastPaymentByStudent = new Map(
      lastPayments.map(p => [p.studentId, p._max.paymentDate])
    )

    // Compose rows
    let rows = students.map(s => {
      const bk = byStudent.get(s.id)!
      return {
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        admissionNumber: s.admissionNumber,
        rollNumber: s.rollNumber,
        class: s.class,
        section: s.section,
        totalOutstanding: round2(bk.total),
        buckets: {
          notDue: round2(bk.notDue),
          b0_30: round2(bk.b0_30),
          b31_60: round2(bk.b31_60),
          b61_90: round2(bk.b61_90),
          b90_plus: round2(bk.b90_plus),
        },
        oldestDueDate: bk.oldestDueDate?.toISOString() ?? null,
        lastPaymentDate: lastPaymentByStudent.get(s.id)?.toISOString() ?? null,
      }
    })

    // Apply post-filters (minAmount + bucket)
    if (minAmount > 0) {
      rows = rows.filter(r => r.totalOutstanding >= minAmount)
    }
    if (bucket !== 'all') {
      const bucketKey = bucket as keyof typeof rows[0]['buckets']
      rows = rows.filter(r => (r.buckets[bucketKey] || 0) > 0)
    }

    // Sort: largest outstanding first
    rows.sort((a, b) => b.totalOutstanding - a.totalOutstanding)

    // Totals (computed BEFORE pagination so the summary matches the filtered set)
    const totals = rows.reduce((acc, r) => {
      acc.outstanding += r.totalOutstanding
      acc.buckets.notDue += r.buckets.notDue
      acc.buckets.b0_30 += r.buckets.b0_30
      acc.buckets.b31_60 += r.buckets.b31_60
      acc.buckets.b61_90 += r.buckets.b61_90
      acc.buckets.b90_plus += r.buckets.b90_plus
      return acc
    }, { studentCount: rows.length, outstanding: 0, buckets: emptyBuckets() })

    totals.outstanding = round2(totals.outstanding)
    const bucketKeys = Object.keys(totals.buckets) as Array<keyof typeof totals.buckets>
    bucketKeys.forEach(k => {
      totals.buckets[k] = round2(totals.buckets[k])
    })

    // Paginate
    const total = rows.length
    const paged = rows.slice((page - 1) * limit, page * limit)

    return NextResponse.json({
      rows: paged,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      totals,
    })
  } catch (error) {
    console.error('Outstanding report error:', error)
    return internalError('loading outstanding fees')
  }
}

interface StudentBuckets {
  total: number
  notDue: number
  b0_30: number
  b31_60: number
  b61_90: number
  b90_plus: number
  oldestDueDate: Date | null
}

function createBuckets(): StudentBuckets {
  return { total: 0, notDue: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0, oldestDueDate: null }
}

function emptyBuckets() {
  return { notDue: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0 }
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
