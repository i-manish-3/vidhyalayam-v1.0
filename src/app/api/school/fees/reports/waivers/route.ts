import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'

/**
 * GET /api/school/fees/reports/waivers
 *
 * Concession / waiver register — every discount, concession and scholarship
 * granted in a period, with the student, fee head, amount and date. Sourced from
 * WAIVER allocations so each row is the amount actually applied to a due.
 *
 * Query params:
 *   academicYear — optional
 *   classId      — optional
 *   startDate, endDate — optional (bounds allocatedAt)
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
    const academicYear = searchParams.get('academicYear') || undefined
    const classId = searchParams.get('classId') || undefined
    const startParam = searchParams.get('startDate')
    const endParam = searchParams.get('endDate')
    const search = searchParams.get('search')?.trim() || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))

    const allocatedAt: { gte?: Date; lt?: Date } = {}
    if (startParam) {
      const d = new Date(startParam)
      if (isNaN(d.getTime())) return apiError(400, 'Invalid startDate')
      allocatedAt.gte = d
    }
    if (endParam) {
      const d = new Date(endParam)
      if (isNaN(d.getTime())) return apiError(400, 'Invalid endDate')
      allocatedAt.lt = d
    }
    const hasDateFilter = allocatedAt.gte || allocatedAt.lt

    // Single student sub-filter so class + search compose (avoids clobbering one
    // `student:` key with another) and both carry schoolId for tenant isolation.
    const studentFilter: { student?: Record<string, unknown> } = (classId || search)
      ? {
          student: {
            schoolId,
            ...(classId ? { classId } : {}),
            ...(search ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { admissionNumber: { contains: search, mode: 'insensitive' } },
              ],
            } : {}),
          },
        }
      : {}

    const waivers = await db.studentFeeLedgerAllocation.findMany({
      where: {
        schoolId,
        deletedAt: null,
        ...(hasDateFilter ? { allocatedAt } : {}),
        creditEntry: { schoolId, entryType: 'WAIVER', deletedAt: null },
        debitEntry: {
          schoolId,
          deletedAt: null,
          status: { not: 'cancelled' },
          ...(academicYear ? { academicYear } : {}),
          ...studentFilter,
        },
      },
      select: {
        amount: true,
        allocatedAt: true,
        creditEntry: { select: { description: true, notes: true, createdBy: true } },
        debitEntry: {
          select: {
            feeHeadName: true,
            installmentName: true,
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
      orderBy: { allocatedAt: 'desc' },
    })

    const allRows = waivers.map((w) => {
      const s = w.debitEntry.student
      return {
        date: w.allocatedAt.toISOString(),
        amount: round2(w.amount),
        feeHeadName: w.debitEntry.feeHeadName || 'Other',
        installmentName: w.debitEntry.installmentName || null,
        reason: w.creditEntry.description || w.creditEntry.notes || null,
        grantedBy: w.creditEntry.createdBy || null,
        student: {
          id: s.id,
          name: `${s.firstName} ${s.lastName || ''}`.trim(),
          admissionNumber: s.admissionNumber,
          rollNumber: s.rollNumber,
          className: s.class?.name ?? null,
          sectionName: s.section?.name ?? null,
        },
      }
    })

    // Per-fee-head summary across the whole filtered set (not just the page).
    const headMap = new Map<string, number>()
    for (const r of allRows) headMap.set(r.feeHeadName, (headMap.get(r.feeHeadName) ?? 0) + r.amount)
    const byHead = Array.from(headMap.entries())
      .map(([feeHeadName, amount]) => ({ feeHeadName, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount)

    const totals = {
      count: allRows.length,
      amount: round2(allRows.reduce((s, r) => s + r.amount, 0)),
    }

    const total = allRows.length
    const paged = allRows.slice((page - 1) * limit, page * limit)

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      rows: paged,
      byHead,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      totals,
    })
  } catch (error) {
    console.error('Waivers report error:', error)
    return internalError('loading waiver register')
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
