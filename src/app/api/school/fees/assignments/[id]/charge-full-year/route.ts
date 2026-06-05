import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import {
  apiError,
  forbiddenError,
  internalError,
  notFoundError,
  unauthorizedError,
} from '@/lib/api-errors'
import { assignStudentFeesFromStructure, createFeeDebitLedgerEntry } from '@/lib/fees'

const AY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

function parseFeeMonths(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((m): m is string => typeof m === 'string' && !!m.trim())
      : []
  } catch {
    return value.split(',').map((m) => m.trim()).filter(Boolean)
  }
}

// Sort academic-year month labels (Apr..Mar) into their calendar order so the
// rebuilt transport feeMonths array reads naturally and demand slips list
// months in sequence.
function sortAyMonths(months: string[]): string[] {
  return [...months].sort((a, b) => {
    const ia = AY_MONTHS.findIndex((m) => m.toLowerCase() === a.toLowerCase())
    const ib = AY_MONTHS.findIndex((m) => m.toLowerCase() === b.toLowerCase())
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
}

// Resolve the FULL fee-month list for a route+stop in an academic year, prefer
// the stop-specific fare row, fall back to the route-level month list.
async function resolveFullFeeMonths(
  schoolId: string,
  routeId: string,
  stopName: string,
  academicYear: string,
): Promise<string[]> {
  const stopFare = await db.transportStopFare.findFirst({
    where: { schoolId, routeId, academicYear, stopName, isActive: true },
    select: { feeMonths: true },
  })
  if (stopFare) return parseFeeMonths(stopFare.feeMonths)

  const route = await db.transportRoute.findFirst({
    where: { id: routeId, schoolId, academicYear, deletedAt: null, isActive: true },
    select: { feeMonths: true },
  })
  return parseFeeMonths(route?.feeMonths)
}

// PATCH /api/school/fees/assignments/[id]/charge-full-year
// Recomputes a zero-paid, pro-rated fee assignment as a full-year demand.
// Used when "Charge Full Year" was missed at admission time: the missing
// pre-join months need to be added back. We hard-delete the old assignment
// tree (safe because nothing is paid) and rebuild it via the shared
// assignStudentFeesFromStructure helper with chargeFullYear=true, so the
// result is byte-for-byte what the admission flow would have produced.
//
// Hard delete (not soft) is required because the rebuilt assignment reuses the
// SAME feeStructureId, and @@unique([studentId, feeStructureId, academicYear])
// does not include deletedAt — a soft-deleted row would collide.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // SUPER_ADMIN is intentionally excluded — same restriction as change-group.
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SCHOOL_ADMIN') {
      const authorized = await requirePermission(request, 'fees:change-group')
      if (!authorized) {
        return forbiddenError("You don't have permission to change fee billing. Contact your school administrator.")
      }
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

    const assignment = await db.studentFeeAssignment.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: {
        invoices: { where: { deletedAt: null }, select: { id: true } },
        items: { select: { id: true } },
        feesGroup: { select: { id: true, name: true } },
      },
    })

    if (!assignment) {
      return notFoundError('StudentFeeAssignment')
    }

    if (assignment.status !== 'active') {
      return apiError(400, 'This fee assignment is not active. Only active assignments can be recomputed.')
    }

    // Already full year? Read the persisted billing mode from the snapshot.
    let currentBillingMode: string | null = null
    if (assignment.snapshotJson) {
      try {
        currentBillingMode = JSON.parse(assignment.snapshotJson)?.billingMode ?? null
      } catch {
        currentBillingMode = null
      }
    }
    if (currentBillingMode === 'full_year') {
      return apiError(400, 'This student is already billed for the full year.')
    }

    // Zero-payment guard. Recompute deletes the existing demand, so it must not
    // destroy any money already received. Any paid amount blocks the action.
    const invoiceIds = assignment.invoices.map((invoice) => invoice.id)
    if (invoiceIds.length > 0) {
      const paidAgg = await db.feeCollection.aggregate({
        where: {
          studentFeeInvoiceId: { in: invoiceIds },
          deletedAt: null,
        },
        _sum: { paidAmount: true },
      })
      const paidTotal = paidAgg._sum.paidAmount || 0
      if (paidTotal > 0) {
        return apiError(
          400,
          'This student has already paid against this fee demand. Full-year recompute for partially-paid students is not supported yet.'
        )
      }
    }

    // Preserve the original join date so the rebuilt full-year demand carries the
    // same effectiveFrom (used for term-head due dates). Fall back to assignedAt.
    const originalEffectiveFrom = assignment.effectiveFrom || assignment.assignedAt || new Date()
    const itemIds = assignment.items.map((item) => item.id)

    let result
    try {
      result = await db.$transaction(async (tx) => {
        // Tear down the old assignment tree, children first so FK constraints
        // stay satisfied. Everything here is zero-paid, so nothing of value is
        // lost. Ledger entries are matched by assignmentId AND by the linked
        // invoices to catch any stragglers.
        await tx.studentFeeLedgerEntry.deleteMany({
          where: {
            schoolId: user.schoolId!,
            OR: [
              { assignmentId: assignment.id },
              ...(invoiceIds.length > 0 ? [{ invoiceId: { in: invoiceIds } }] : []),
              ...(itemIds.length > 0 ? [{ assignmentItemId: { in: itemIds } }] : []),
            ],
          },
        })

        if (invoiceIds.length > 0) {
          // Notifications hold a required (non-nullable) FK to the invoice, so
          // they must go before the invoices themselves.
          await tx.feeNotification.deleteMany({
            where: { invoiceId: { in: invoiceIds } },
          })
        }

        await tx.feeCollection.deleteMany({
          where: {
            schoolId: user.schoolId!,
            OR: [
              ...(invoiceIds.length > 0 ? [{ studentFeeInvoiceId: { in: invoiceIds } }] : []),
              ...(itemIds.length > 0 ? [{ studentFeeAssignmentItemId: { in: itemIds } }] : []),
            ],
          },
        })

        if (invoiceIds.length > 0) {
          await tx.studentFeeInvoiceLine.deleteMany({
            where: { invoiceId: { in: invoiceIds } },
          })
          await tx.studentFeeInvoice.deleteMany({
            where: { id: { in: invoiceIds } },
          })
        }

        await tx.studentFeeAssignmentItem.deleteMany({
          where: { assignmentId: assignment.id },
        })

        await tx.studentFeeAssignment.delete({
          where: { id: assignment.id },
        })

        await tx.feeAuditLog.create({
          data: {
            schoolId: user.schoolId!,
            entityType: 'StudentFeeAssignment',
            entityId: assignment.id,
            action: 'deleted_for_full_year_recompute',
            studentId: assignment.studentId,
            oldValue: JSON.stringify({
              feesGroupId: assignment.feesGroupId,
              feesGroupName: assignment.feesGroup?.name || null,
              feeStructureId: assignment.feeStructureId,
              billingMode: currentBillingMode || 'pro_rated',
            }),
            newValue: JSON.stringify({ billingMode: 'full_year', reason: reason || null }),
            userId: user.userId,
          },
        })

        const newAssignment = await assignStudentFeesFromStructure({
          tx,
          schoolId: user.schoolId!,
          studentId: assignment.studentId,
          classId: assignment.classId,
          sectionId: assignment.sectionId,
          feesGroupId: assignment.feesGroupId,
          academicYear: assignment.academicYear,
          assignedBy: user.userId,
          source: 'full-year-recompute',
          effectiveFrom: originalEffectiveFrom,
          chargeFullYear: true,
        })

        if (!newAssignment) {
          throw new Error('FEE_STRUCTURE_NOT_FOUND')
        }

        await tx.feeAuditLog.create({
          data: {
            schoolId: user.schoolId!,
            entityType: 'StudentFeeAssignment',
            entityId: newAssignment.id,
            action: 'created_via_full_year_recompute',
            studentId: assignment.studentId,
            oldValue: JSON.stringify({ previousAssignmentId: assignment.id }),
            newValue: JSON.stringify({
              feesGroupId: assignment.feesGroupId,
              feesGroupName: assignment.feesGroup?.name || null,
              billingMode: 'full_year',
            }),
            userId: user.userId,
          },
        })

        // ─── Transport top-up ────────────────────────────────────────────
        // Transport is billed independently of the fee structure: a
        // TransportAllocation plus monthly FeeCollection + DEBIT rows, each
        // pro-rated from the join month at admission time. Full-year billing
        // must also restore the transport months skipped before the join.
        //
        // This is ADDITIVE — we only create the missing earlier months and
        // never touch the months already on the allocation. So any transport
        // fee already billed or paid stays exactly as-is (no delete, no FK
        // cascade risk), and re-running is idempotent (no duplicate months).
        const transportAllocation = await tx.transportAllocation.findFirst({
          where: {
            schoolId: user.schoolId!,
            studentId: assignment.studentId,
            academicYear: assignment.academicYear,
            isActive: true,
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, routeId: true, stopName: true, fareAmount: true, feeMonths: true },
        })

        let transportMonthsAdded = 0
        if (transportAllocation?.routeId && transportAllocation.stopName) {
          const fullMonths = await resolveFullFeeMonths(
            user.schoolId!,
            transportAllocation.routeId,
            transportAllocation.stopName,
            assignment.academicYear,
          )
          const currentMonths = parseFeeMonths(transportAllocation.feeMonths)
          const currentSet = new Set(currentMonths.map((m) => m.toLowerCase()))
          const missingMonths = fullMonths.filter((m) => !currentSet.has(m.toLowerCase()))

          if (missingMonths.length > 0) {
            const mergedMonths = sortAyMonths([...currentMonths, ...missingMonths])
            await tx.transportAllocation.update({
              where: { id: transportAllocation.id },
              data: { feeMonths: JSON.stringify(mergedMonths) },
            })

            if (transportAllocation.fareAmount > 0) {
              for (const month of missingMonths) {
                const transportCollection = await tx.feeCollection.create({
                  data: {
                    schoolId: user.schoolId!,
                    studentId: assignment.studentId,
                    amount: transportAllocation.fareAmount,
                    paidAmount: 0,
                    discount: 0,
                    concession: 0,
                    scholarship: 0,
                    fine: 0,
                    paymentStatus: 'unpaid',
                    installmentName: month,
                    feeHeadName: 'Transport Fee',
                    notes: `Transport fee for ${transportAllocation.stopName} (${assignment.academicYear})`,
                  },
                })
                await createFeeDebitLedgerEntry({
                  tx,
                  schoolId: user.schoolId!,
                  studentId: assignment.studentId,
                  academicYear: assignment.academicYear,
                  feeCollectionId: transportCollection.id,
                  sourceType: 'transport',
                  sourceId: transportCollection.id,
                  feeHeadName: 'Transport Fee',
                  installmentName: month,
                  description: `Transport Fee - ${month}`,
                  amount: transportAllocation.fareAmount,
                  notes: `Transport fee for ${transportAllocation.stopName} (${assignment.academicYear})`,
                  createdBy: user.userId,
                })
              }
            }
            transportMonthsAdded = missingMonths.length

            await tx.feeAuditLog.create({
              data: {
                schoolId: user.schoolId!,
                entityType: 'TransportAllocation',
                entityId: transportAllocation.id,
                action: 'transport_full_year_topup',
                studentId: assignment.studentId,
                oldValue: JSON.stringify({ feeMonths: currentMonths }),
                newValue: JSON.stringify({ feeMonths: mergedMonths, addedMonths: missingMonths }),
                userId: user.userId,
              },
            })
          }
        }

        return { newAssignment, transportMonthsAdded }
      })
    } catch (txError) {
      if (txError instanceof Error && txError.message === 'FEE_STRUCTURE_NOT_FOUND') {
        return apiError(
          400,
          `No active fee structure exists for this class & fee group in ${assignment.academicYear}. Please create one and try again.`
        )
      }
      throw txError
    }

    const transportNote =
      result.transportMonthsAdded > 0
        ? ` Transport extended by ${result.transportMonthsAdded} month${result.transportMonthsAdded === 1 ? '' : 's'}.`
        : ''

    return NextResponse.json({
      assignment: result.newAssignment,
      message: `Fee demand recomputed for the full academic year.${transportNote}`,
    })
  } catch (error) {
    console.error('Charge full year error:', error)
    return internalError('recomputing the full-year fee demand')
  }
}
