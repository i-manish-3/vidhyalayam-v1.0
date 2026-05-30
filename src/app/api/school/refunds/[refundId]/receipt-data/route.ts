/**
 * GET /api/school/refunds/[refundId]/receipt-data
 *
 * Returns everything the printable refund-receipt page needs in one call:
 * the refund row, the student's identifying info, and the school header
 * (name + printHeader banner). Tenant scoping flows through the JWT's
 * schoolId — a refund issued in another tenant returns 404.
 *
 * RBAC: `fees:read`. Voided refunds are returned (the receipt page renders
 * a "VOIDED" stamp); soft-deleted ones are not.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ refundId: string }> },
) {
  try {
    const user = await requirePermission(request, 'fees:read')
    if (!user || !user.schoolId) return unauthorizedError()

    const { refundId } = await params

    const refund = await db.studentFeeRefund.findFirst({
      where: {
        id: refundId,
        schoolId: user.schoolId,
        deletedAt: null,
      },
    })
    if (!refund) return apiError(404, 'Refund not found')

    const [school, student, withdrawal, issuer, voidedByUser] = await Promise.all([
      db.school.findUnique({
        where: { id: user.schoolId },
        select: {
          name: true,
          address: true,
          city: true,
          state: true,
          pincode: true,
          contactPhone: true,
          contactEmail: true,
          printHeader: true,
        },
      }),
      db.student.findFirst({
        where: { id: refund.studentId, schoolId: user.schoolId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          rollNumber: true,
          class: { select: { name: true } },
          admission: { select: { fatherName: true } },
        },
      }),
      db.studentWithdrawal.findUnique({
        where: { id: refund.withdrawalId },
        select: {
          id: true,
          effectiveDate: true,
          reason: true,
          totalRefundDue: true,
        },
      }),
      refund.issuedBy
        ? db.user.findUnique({
            where: { id: refund.issuedBy },
            select: { name: true },
          })
        : Promise.resolve(null),
      refund.voidedBy
        ? db.user.findUnique({
            where: { id: refund.voidedBy },
            select: { name: true },
          })
        : Promise.resolve(null),
    ])

    if (!student) return apiError(404, 'Student not found for this refund')

    const userName = (u: { name: string } | null) => u?.name?.trim() || null

    return NextResponse.json({
      success: true,
      refund: {
        id: refund.id,
        receiptNumber: refund.receiptNumber,
        amount: refund.amount,
        paymentMethod: refund.paymentMethod,
        scope: refund.scope,
        academicYear: refund.academicYear,
        issuedDate: refund.issuedDate,
        notes: refund.notes,
        voidedAt: refund.voidedAt,
        voidReason: refund.voidReason,
        issuedByName: userName(issuer),
        voidedByName: userName(voidedByUser),
      },
      withdrawal,
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        admissionNumber: student.admissionNumber,
        rollNumber: student.rollNumber,
        fatherName: student.admission?.fatherName || null,
        className: student.class?.name || null,
      },
      school,
    })
  } catch (error) {
    console.error('GET /refunds/[refundId]/receipt-data failed:', error)
    return internalError('Failed to load refund receipt')
  }
}
