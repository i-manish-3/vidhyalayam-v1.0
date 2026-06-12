import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'

/**
 * GET /api/school/fees/reports/aggregations
 *
 * Roll-ups of billed / collected / outstanding by:
 *   - class (with section breakdown nested)
 *   - fee head
 *
 * Query params:
 *   academicYear (optional)
 *   startDate, endDate (optional — bounds the "collected" window;
 *                       billing aggregation always uses all-time-within-AY).
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
    const startParam = searchParams.get('startDate')
    const endParam = searchParams.get('endDate')

    const ayFilter = academicYear ? { academicYear } : {}
    const collectionDateFilter: any = {}
    if (startParam) collectionDateFilter.gte = new Date(startParam)
    if (endParam) collectionDateFilter.lt = new Date(endParam)
    const hasDateFilter = Object.keys(collectionDateFilter).length > 0

    // ── Aggregate by class ────────────────────────────────────────────
    // Strategy: fetch ledger entries with student.class joined; tally in JS.
    // For ~thousands of entries this is acceptable; for millions, move to
    // a raw SQL query with GROUP BY class_id.
    const [entries, allocations] = await Promise.all([
      db.studentFeeLedgerEntry.findMany({
      where: {
        schoolId,
        deletedAt: null,
        entryType: { in: ['DEBIT', 'FINE', 'REFUND'] },
        ...ayFilter,
      },
      select: {
        entryType: true,
        debit: true,
        credit: true,
        balanceAmount: true,
        status: true,
        transactionDate: true,
        feeHeadName: true,
        sourceType: true,
        student: {
          select: {
            id: true,
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
          ...(hasDateFilter ? { allocatedAt: collectionDateFilter } : {}),
          creditEntry: {
            entryType: 'CREDIT',
            deletedAt: null,
          },
          debitEntry: {
            schoolId,
            deletedAt: null,
            ...ayFilter,
          },
        },
        select: {
          amount: true,
          debitEntry: {
            select: {
              feeHeadName: true,
              sourceType: true,
              student: {
                select: {
                  id: true,
                  class: { select: { id: true, name: true } },
                  section: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
    ])

    // Class aggregation
    const classMap = new Map<string, ClassAgg>()
    const headMap = new Map<string, HeadAgg>()
    const serviceMap = new Map<ServiceKey, ServiceAgg>(
      SERVICE_ORDER.map(key => [
        key,
        { key, label: SERVICE_LABELS[key], billed: 0, collected: 0, outstanding: 0 },
      ])
    )
    const studentSet = new Map<string, Set<string>>() // classId → set<studentId>
    // Class × Head pivot. Key = `${classId}::${headName}`, plus side tables
    // tracking which classIds/headNames appear (for stable axis ordering).
    const matrixMap = new Map<string, MatrixCell>()
    const matrixClassNames = new Map<string, string>() // classId → className

    for (const e of entries) {
      const cls = e.student.class
      const classId = cls?.id ?? '__none__'
      const className = cls?.name ?? 'Unassigned'
      matrixClassNames.set(classId, className)

      const inCollectionWindow = !hasDateFilter
        || (e.transactionDate >= (collectionDateFilter.gte ?? new Date(0))
            && e.transactionDate < (collectionDateFilter.lt ?? new Date(8.64e15)))

      const ca = classMap.get(classId) ?? {
        classId, className, billed: 0, collected: 0, outstanding: 0, refunded: 0,
      }
      if (e.entryType === 'DEBIT' || e.entryType === 'FINE') {
        ca.billed += e.debit
        if (e.status === 'open' || e.status === 'partial') {
          ca.outstanding += e.balanceAmount || 0
        }
      } else if (e.entryType === 'REFUND' && inCollectionWindow) {
        ca.refunded += e.debit
      }
      classMap.set(classId, ca)

      // Track distinct students per class
      const set = studentSet.get(classId) ?? new Set<string>()
      set.add(e.student.id)
      studentSet.set(classId, set)

      // Fee head aggregation
      const headName = e.feeHeadName || 'Other'
      const ha = headMap.get(headName) ?? { name: headName, billed: 0, collected: 0, outstanding: 0 }
      if (e.entryType === 'DEBIT' || e.entryType === 'FINE') {
        ha.billed += e.debit
        if (e.status === 'open' || e.status === 'partial') {
          ha.outstanding += e.balanceAmount || 0
        }
      }
      headMap.set(headName, ha)

      // Service aggregation keeps hostel and transport separate from academic
      // fees even when all three share the monthly ledger.
      const serviceKey = getServiceKey(e.sourceType, e.feeHeadName)
      const sa = serviceMap.get(serviceKey)!
      if (e.entryType === 'DEBIT' || e.entryType === 'FINE') {
        sa.billed += e.debit
        if (e.status === 'open' || e.status === 'partial') {
          sa.outstanding += e.balanceAmount || 0
        }
      }
      serviceMap.set(serviceKey, sa)

      // Class × Head pivot — same DEBIT/CREDIT logic, keyed by (class, head).
      // REFUND/FINE roll into the head they reference (FINE adds to billed and
      // contributes to outstanding when unpaid; REFUND is ignored at the matrix
      // level to keep cells readable — refunds are visible in the class table).
      const cellKey = `${classId}::${headName}`
      const cell = matrixMap.get(cellKey) ?? { billed: 0, collected: 0, outstanding: 0 }
      if (e.entryType === 'DEBIT' || e.entryType === 'FINE') {
        cell.billed += e.debit
        if (e.status === 'open' || e.status === 'partial') {
          cell.outstanding += e.balanceAmount || 0
        }
      }
      matrixMap.set(cellKey, cell)
    }

    for (const allocation of allocations) {
      const debit = allocation.debitEntry
      const cls = debit.student.class
      const classId = cls?.id ?? '__none__'
      const className = cls?.name ?? 'Unassigned'
      const amount = allocation.amount || 0
      const headName = debit.feeHeadName || 'Other'

      const ca = classMap.get(classId) ?? {
        classId, className, billed: 0, collected: 0, outstanding: 0, refunded: 0,
      }
      ca.collected += amount
      classMap.set(classId, ca)

      const set = studentSet.get(classId) ?? new Set<string>()
      set.add(debit.student.id)
      studentSet.set(classId, set)

      const ha = headMap.get(headName) ?? { name: headName, billed: 0, collected: 0, outstanding: 0 }
      ha.collected += amount
      headMap.set(headName, ha)

      const serviceKey = getServiceKey(debit.sourceType, debit.feeHeadName)
      const sa = serviceMap.get(serviceKey)!
      sa.collected += amount
      serviceMap.set(serviceKey, sa)

      const cellKey = `${classId}::${headName}`
      const cell = matrixMap.get(cellKey) ?? { billed: 0, collected: 0, outstanding: 0 }
      cell.collected += amount
      matrixMap.set(cellKey, cell)
    }

    // Build response
    const byClass = Array.from(classMap.values())
      .map(c => ({
        classId: c.classId,
        className: c.className,
        billed: round2(c.billed),
        collected: round2(c.collected),
        outstanding: round2(c.outstanding),
        refunded: round2(c.refunded),
        studentCount: studentSet.get(c.classId)?.size ?? 0,
        collectionRate: c.billed > 0 ? Number(((c.collected / c.billed) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.outstanding - a.outstanding)

    const byFeeHead = Array.from(headMap.values())
      .map(h => ({
        feeHeadName: h.name,
        billed: round2(h.billed),
        collected: round2(h.collected),
        outstanding: round2(h.outstanding),
        collectionRate: h.billed > 0 ? Number(((h.collected / h.billed) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.billed - a.billed)

    const byService = SERVICE_ORDER.map(key => {
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

    // Grand totals
    const totals = byClass.reduce(
      (acc, c) => {
        acc.billed += c.billed
        acc.collected += c.collected
        acc.outstanding += c.outstanding
        acc.refunded += c.refunded
        return acc
      },
      { billed: 0, collected: 0, outstanding: 0, refunded: 0 }
    )
    const totalKeys = Object.keys(totals) as Array<keyof typeof totals>
    totalKeys.forEach(k => {
      totals[k] = round2(totals[k])
    })

    // ── Class × Head pivot ─────────────────────────────────────────────
    // Axis ordering matches the already-sorted byClass (outstanding desc) and
    // byFeeHead (billed desc) lists so the UI can render either axis without
    // re-sorting.
    const matrixClassAxis = byClass.map(c => ({ classId: c.classId, className: c.className }))
    const matrixHeadAxis = byFeeHead.map(h => h.feeHeadName)
    const matrixCells: Record<string, Record<string, MatrixCell>> = {}
    for (const { classId } of matrixClassAxis) {
      const row: Record<string, MatrixCell> = {}
      for (const headName of matrixHeadAxis) {
        const cell = matrixMap.get(`${classId}::${headName}`)
        row[headName] = cell
          ? {
              billed: round2(cell.billed),
              collected: round2(cell.collected),
              outstanding: round2(cell.outstanding),
            }
          : { billed: 0, collected: 0, outstanding: 0 }
      }
      matrixCells[classId] = row
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      byClass,
      byService,
      byFeeHead,
      matrix: {
        classes: matrixClassAxis,
        heads: matrixHeadAxis,
        cells: matrixCells,
      },
      totals,
    })
  } catch (error) {
    console.error('Aggregations report error:', error)
    return internalError('loading aggregations')
  }
}

interface ClassAgg {
  classId: string
  className: string
  billed: number
  collected: number
  outstanding: number
  refunded: number
}

interface HeadAgg {
  name: string
  billed: number
  collected: number
  outstanding: number
}

type ServiceKey = 'fees' | 'transport' | 'hostel'

interface ServiceAgg {
  key: ServiceKey
  label: string
  billed: number
  collected: number
  outstanding: number
}

interface MatrixCell {
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
