import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// Super-admin only. Permanently removes students of a school (and every row
// that references them) from the database. There is NO restore — callers must
// send the exact confirmation phrase.
const CONFIRM_PHRASE = 'DELETE-STUDENTS'

const VALID_SCOPES = new Set(['all', 'active', 'disabled'])

const PAGE_SIZE = 20

function buildScopeWhere(scope: string) {
  if (scope === 'active') return { isActive: true }
  if (scope === 'disabled') return { isActive: false }
  return {}
}

export function parseScope(value: string | null): string {
  return value && VALID_SCOPES.has(value) ? value : 'all'
}

const STUDENT_LIST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  admissionNumber: true,
  isActive: true,
  class: { select: { name: true } },
  section: { select: { name: true } },
} as const

function buildStudentQuery(schoolId: string, scope: string, q: string) {
  const query = q.trim()
  return {
    schoolId,
    deletedAt: null,
    ...buildScopeWhere(scope),
    ...(query
      ? {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' as const } },
            { lastName: { contains: query, mode: 'insensitive' as const } },
            { admissionNumber: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }
}

// GET /api/super-admin/schools/[id]/students?scope=all|active|disabled&q=&page=1
// Returns a paginated student list (`students`, `total`) plus the scope-wide
// count (`count`) of how many students would be deleted by the scope action.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const { id: schoolId } = await params
    const searchParams = new URL(request.url).searchParams
    const scope = parseScope(searchParams.get('scope'))
    const q = searchParams.get('q') ?? ''
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)

    const school = await db.school.findUnique({ where: { id: schoolId }, select: { id: true } })
    if (!school) return apiError(404, 'School not found.')

    const count = await db.student.count({
      where: { schoolId, deletedAt: null, ...buildScopeWhere(scope) },
    })

    const where = buildStudentQuery(schoolId, scope, q)
    const [total, students] = await Promise.all([
      db.student.count({ where }),
      db.student.findMany({
        where,
        orderBy: [{ firstName: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: STUDENT_LIST_SELECT,
      }),
    ])

    return NextResponse.json({ count, total, students, page, pageSize: PAGE_SIZE, hasMore: total > page * PAGE_SIZE })
  } catch (error) {
    console.error('[SUPER_ADMIN_STUDENT_WIPE_COUNT]', error)
    return internalError('counting students')
  }
}

// DELETE /api/super-admin/schools/[id]/students
// Body: { scope: 'all'|'active'|'disabled', confirmText: string, studentIds?: string[] }
// With `studentIds` only those selected students are deleted (they must match
// the school + scope filter). Without it every student in the scope is deleted.
// Rows are removed in FK-safe order inside one transaction.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const { id: schoolId } = await params
    const school = await db.school.findUnique({ where: { id: schoolId }, select: { id: true } })
    if (!school) return apiError(404, 'School not found.')

    const body = await request.json().catch(() => null)
    const scope = parseScope(body?.scope)
    const confirmText = String(body?.confirmText ?? '').trim()
    if (confirmText !== CONFIRM_PHRASE) {
      return apiError(400, `Confirmation failed. Type ${CONFIRM_PHRASE} exactly to proceed.`)
    }

    const requestedIds = Array.isArray(body?.studentIds)
      ? body.studentIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0).slice(0, 1000)
      : []

    const studentIds =
      requestedIds.length > 0
        ? await db.student
            .findMany({
              where: { id: { in: requestedIds }, ...buildStudentQuery(schoolId, scope, '') },
              select: { id: true },
            })
            .then((rows) => rows.map((r) => r.id))
        : await db.student
            .findMany({
              where: buildStudentQuery(schoolId, scope, ''),
              select: { id: true },
            })
            .then((rows) => rows.map((r) => r.id))

    if (studentIds.length === 0) {
      return NextResponse.json({ deleted: 0 })
    }

    const deleted = await db.$transaction(async (tx) => {
      // Collect parent ids of grandchildren that only link back through them.
      const [admissionIds, assignmentIds, invoiceIds, saleIds] = await Promise.all([
        tx.admission.findMany({ where: { studentId: { in: studentIds } }, select: { id: true } }).then((r) => r.map((x) => x.id)),
        tx.studentFeeAssignment.findMany({ where: { studentId: { in: studentIds } }, select: { id: true } }).then((r) => r.map((x) => x.id)),
        tx.studentFeeInvoice.findMany({ where: { studentId: { in: studentIds } }, select: { id: true } }).then((r) => r.map((x) => x.id)),
        tx.inventorySale.findMany({ where: { studentId: { in: studentIds } }, select: { id: true } }).then((r) => r.map((x) => x.id)),
      ])

      // Grandchildren (refer their parent with RESTRICT, so they go first).
      if (admissionIds.length > 0) {
        await tx.admissionActivity.deleteMany({ where: { admissionId: { in: admissionIds } } })
        await tx.admissionDocument.deleteMany({ where: { admissionId: { in: admissionIds } } })
        await tx.admissionNote.deleteMany({ where: { admissionId: { in: admissionIds } } })
      }
      if (assignmentIds.length > 0) {
        await tx.studentFeeAssignmentItem.deleteMany({ where: { assignmentId: { in: assignmentIds } } })
      }
      if (invoiceIds.length > 0) {
        await tx.studentFeeInvoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } })
        await tx.feeNotification.deleteMany({ where: { invoiceId: { in: invoiceIds } } })
      }
      if (saleIds.length > 0) {
        await tx.inventorySaleItem.deleteMany({ where: { saleId: { in: saleIds } } })
        await tx.inventorySaleReturn.deleteMany({ where: { saleId: { in: saleIds } } })
      }

      // Direct children, leaf-first within each group (RESTRICT edges).
      // ExamResult cascades to ResultSubjectSummary; invoice/payment/collection
      // rows SET NULL from ledger entries, but we delete them all anyway.
      // -> ledger allocation rows reference ledger entries, so they go first.
      await tx.studentFeeLedgerAllocation.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.studentFeePayment.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.studentFeeLedgerEntry.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.feeCollection.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.inventorySale.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.studentFeeRefund.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.studentWithdrawal.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.examResult.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.studentFeeAssignment.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.studentFeeInvoice.deleteMany({ where: { studentId: { in: studentIds } } })
      // Children that only reference the student (no FK constraints in the DB,
      // deleted as hygiene so the audit tables don't keep dangling references).
      await tx.examGroupResult.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.finalResult.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.examAuditLog.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.studentSubjectMapping.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.bookIssue.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.transportEvent.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.hostelEvent.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.transportAllocation.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.hostelAllocation.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.rfidTapLog.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.studentCard.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.attendanceChangeLog.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.attendance.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.marksEntry.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.feeAuditLog.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.studentParent.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.studentAcademicEnrollment.deleteMany({ where: { studentId: { in: studentIds } } })
      await tx.admission.deleteMany({ where: { studentId: { in: studentIds } } })

      const res = await tx.student.deleteMany({ where: { id: { in: studentIds }, schoolId } })
      return res.count
    })

    return NextResponse.json({ deleted })
  } catch (error) {
    console.error('[SUPER_ADMIN_STUDENT_WIPE]', error)
    return internalError('permanently deleting students. No changes were made.')
  }
}