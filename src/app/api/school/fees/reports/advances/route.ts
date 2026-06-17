import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'

/**
 * GET /api/school/fees/reports/advances
 *
 * Advance (prepaid) credit held per student — money received but not yet applied
 * to any due. These are CREDIT ledger entries with a leftover balanceAmount.
 * Until now this money was invisible: it is not "outstanding" (it's not a debit)
 * and not fully "collected against dues" (it isn't allocated).
 *
 * Query params:
 *   classId      — optional class filter
 *   academicYear — optional
 *   search       — match name / admission number
 *   page, limit  — pagination
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
    const academicYear = searchParams.get('academicYear') || undefined
    const search = searchParams.get('search')?.trim() || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))

    const studentFilter = (classId || search)
      ? {
          student: {
            schoolId,
            deletedAt: null,
            ...(classId ? { classId } : {}),
            ...(search ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' as const } },
                { lastName: { contains: search, mode: 'insensitive' as const } },
                { admissionNumber: { contains: search, mode: 'insensitive' as const } },
              ],
            } : {}),
          },
        }
      : {}

    // Open/partial CREDIT entries still carrying an unspent balance. Class/search
    // is pushed into this first query so we never materialise the whole school.
    const openCredits = await db.studentFeeLedgerEntry.findMany({
      where: {
        schoolId,
        deletedAt: null,
        entryType: 'CREDIT',
        balanceAmount: { gt: 0 },
        ...(academicYear ? { academicYear } : {}),
        ...studentFilter,
      },
      select: {
        studentId: true,
        balanceAmount: true,
        transactionDate: true,
        paymentMethod: true,
        receiptNumber: true,
      },
    })

    if (openCredits.length === 0) {
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        rows: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        totals: { studentCount: 0, advance: 0 },
      })
    }

    const byStudent = new Map<string, { advance: number; latest: Date | null }>()
    for (const c of openCredits) {
      const cur = byStudent.get(c.studentId) ?? { advance: 0, latest: null }
      cur.advance += c.balanceAmount || 0
      if (!cur.latest || c.transactionDate > cur.latest) cur.latest = c.transactionDate
      byStudent.set(c.studentId, cur)
    }

    const studentIds = Array.from(byStudent.keys())
    const students = await db.student.findMany({
      where: {
        id: { in: studentIds },
        schoolId,
        deletedAt: null,
        ...(classId ? { classId } : {}),
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

    let rows = students.map((s) => {
      const a = byStudent.get(s.id)!
      return {
        studentId: s.id,
        name: `${s.firstName} ${s.lastName || ''}`.trim(),
        admissionNumber: s.admissionNumber,
        rollNumber: s.rollNumber,
        class: s.class,
        section: s.section,
        advance: round2(a.advance),
        lastPaymentDate: a.latest?.toISOString() ?? null,
      }
    })
    rows = rows.filter((r) => r.advance > 0).sort((a, b) => b.advance - a.advance)

    const totals = {
      studentCount: rows.length,
      advance: round2(rows.reduce((s, r) => s + r.advance, 0)),
    }

    const total = rows.length
    const paged = rows.slice((page - 1) * limit, page * limit)

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      rows: paged,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      totals,
    })
  } catch (error) {
    console.error('Advances report error:', error)
    return internalError('loading advance balances')
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
