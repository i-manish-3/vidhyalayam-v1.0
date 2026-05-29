import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import {
  apiError,
  forbiddenError,
  internalError,
  unauthorizedError,
  validationError,
} from '@/lib/api-errors'
import {
  generateMonthlyDemandSlip,
  generateBulkDemandSlips,
  selectDueAssignmentItems,
  computePreviousBalance,
} from '@/lib/fee-demand'

interface PostBody {
  month?: unknown
  year?: unknown
  scope?: unknown
  studentId?: unknown
  filters?: unknown
  dryRun?: unknown
  force?: unknown
}

function cleanInt(value: unknown, min: number, max: number): number | null {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) return null
  return n
}

export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const ok = await requirePermission(request, 'fees:create')
      if (!ok) return forbiddenError("You don't have permission to generate demand slips.")
    }

    const body = (await request.json()) as PostBody
    const month = cleanInt(body.month, 1, 12)
    const year = cleanInt(body.year, 2020, 2100)
    if (!month || !year) return validationError('Valid month (1-12) and year (2020-2100) are required.')

    const scope = body.scope === 'single' || body.scope === 'bulk' ? body.scope : null
    if (!scope) return validationError("scope must be 'single' or 'bulk'.")

    const force = body.force === true
    const dryRun = body.dryRun === true
    const generatedBy = user.userId

    if (scope === 'single') {
      const studentId = typeof body.studentId === 'string' ? body.studentId : ''
      if (!studentId) return validationError('studentId is required for single scope.')

      const student = await db.student.findFirst({
        where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
        select: { id: true, isActive: true },
      })
      if (!student) return apiError(404, 'Student not found.')

      if (dryRun) {
        const preview = await db.$transaction(async (tx) => {
          // Mirror bulk dry-run: if force=true and an existing slip is present,
          // exclude its lines from the alreadyBilled filter so preview shows
          // what the regenerated slip will contain.
          const existing = await tx.studentFeeInvoice.findFirst({
            where: {
              schoolId: user.schoolId!, studentId,
              isMonthlyDemand: true, billingMonth: month, billingYear: year,
              deletedAt: null,
            },
            select: { id: true },
          })
          const items = await selectDueAssignmentItems(
            tx, user.schoolId!, studentId, month, year,
            existing && force ? existing.id : null
          )
          const firstDay = new Date(Date.UTC(year, month - 1, 1))
          const previousBalance = await computePreviousBalance(tx, user.schoolId!, studentId, firstDay)
          const subtotal = items.reduce((s, i) => s + i.amount, 0)
          return {
            itemCount: items.length,
            subtotal,
            previousBalance,
            totalAmount: subtotal + previousBalance,
          }
        })
        return NextResponse.json({
          scope: 'single',
          dryRun: true,
          studentId,
          month,
          year,
          ...preview,
        })
      }

      const result = await db.$transaction((tx) =>
        generateMonthlyDemandSlip(tx, {
          schoolId: user.schoolId!,
          studentId,
          month,
          year,
          generatedBy,
          force,
        })
      )

      return NextResponse.json({ scope: 'single', month, year, result })
    }

    // scope === 'bulk'
    const filtersInput = body.filters && typeof body.filters === 'object' ? (body.filters as Record<string, unknown>) : {}
    const filters: { classId?: string | null; sectionId?: string | null; studentIds?: string[] | null } = {}
    if (typeof filtersInput.classId === 'string') filters.classId = filtersInput.classId
    if (typeof filtersInput.sectionId === 'string') filters.sectionId = filtersInput.sectionId
    if (Array.isArray(filtersInput.studentIds)) {
      filters.studentIds = filtersInput.studentIds.filter((id): id is string => typeof id === 'string')
    }

    const result = await generateBulkDemandSlips({
      schoolId: user.schoolId,
      month,
      year,
      filters,
      generatedBy,
      force,
      dryRun,
    })

    return NextResponse.json({ scope: 'bulk', month, year, dryRun, result })
  } catch (error) {
    console.error('Generate demand slip error:', error)
    return internalError('generating demand slips')
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const ok = await requirePermission(request, 'fees:read')
      if (!ok) return forbiddenError("You don't have permission to view demand slips.")
    }

    const { searchParams } = new URL(request.url)
    const month = cleanInt(searchParams.get('month'), 1, 12)
    const year = cleanInt(searchParams.get('year'), 2020, 2100)
    const classId = searchParams.get('classId') || undefined
    const sectionId = searchParams.get('sectionId') || undefined
    const studentId = searchParams.get('studentId') || undefined
    const runId = searchParams.get('runId') || undefined
    const limit = cleanInt(searchParams.get('limit'), 1, 500) || 100

    const studentWhere: Record<string, unknown> = {}
    if (classId) studentWhere.classId = classId
    if (sectionId) studentWhere.sectionId = sectionId

    const slips = await db.studentFeeInvoice.findMany({
      where: {
        schoolId: user.schoolId,
        isMonthlyDemand: true,
        deletedAt: null,
        ...(month ? { billingMonth: month } : {}),
        ...(year ? { billingYear: year } : {}),
        ...(studentId ? { studentId } : {}),
        ...(runId ? { demandRunId: runId } : {}),
        ...(Object.keys(studentWhere).length > 0 ? { student: studentWhere } : {}),
      },
      select: {
        id: true,
        invoiceNumber: true,
        billingMonth: true,
        billingYear: true,
        invoiceDate: true,
        dueDate: true,
        subtotal: true,
        previousBalance: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
        demandRunId: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            class: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
          },
        },
        _count: { select: { lines: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    })

    return NextResponse.json({
      slips: slips.map((s) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        billingMonth: s.billingMonth,
        billingYear: s.billingYear,
        invoiceDate: s.invoiceDate,
        dueDate: s.dueDate,
        subtotal: s.subtotal,
        previousBalance: s.previousBalance,
        totalAmount: s.totalAmount,
        paidAmount: s.paidAmount,
        status: s.status,
        demandRunId: s.demandRunId,
        lineCount: s._count.lines,
        student: s.student,
      })),
    })
  } catch (error) {
    console.error('List demand slips error:', error)
    return internalError('loading demand slips')
  }
}
