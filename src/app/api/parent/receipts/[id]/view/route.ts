import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError } from '@/lib/api-errors'
import { getParentChildStudentIds } from '@/lib/parent-access'
import { renderReceiptHtmlFromCredit } from '@/lib/fee-slip-render'

// GET /api/parent/receipts/[id]/view — printable receipt HTML for one of the
// parent's children. `id` is the StudentFeePayment id (URL-safe cuid). Opened in
// a new tab from the portal.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRole(request, ['PARENT'])
    if (!user || !user.schoolId) return unauthorizedError()

    const { id } = await params
    const childIds = await getParentChildStudentIds(user.userId, user.schoolId)
    if (childIds.length === 0) return unauthorizedError()

    const payment = await db.studentFeePayment.findFirst({
      where: { id, schoolId: user.schoolId, studentId: { in: childIds }, cancelledAt: null },
      select: { id: true, receiptNumber: true, studentId: true },
    })
    if (!payment) return notFoundError('Receipt')

    // The printable receipt is reconstructed from the CREDIT ledger entry (its
    // allocations + persisted slip snapshot). Match by paymentId first, falling
    // back to the receipt number for legacy rows.
    const credit = await db.studentFeeLedgerEntry.findFirst({
      where: {
        schoolId: user.schoolId,
        studentId: payment.studentId,
        entryType: 'CREDIT',
        deletedAt: null,
        OR: [{ paymentId: payment.id }, { receiptNumber: payment.receiptNumber }],
      },
      include: {
        creditAllocations: {
          where: { deletedAt: null },
          include: {
            debitEntry: {
              include: {
                feeCollection: true,
                debitAllocations: {
                  where: { deletedAt: null },
                  include: { creditEntry: { select: { id: true, receiptNumber: true, entryType: true, sourceType: true, credit: true, transactionDate: true, createdAt: true } } },
                },
              },
            },
          },
        },
      },
    })
    if (!credit) return notFoundError('Receipt')

    const [student, school] = await Promise.all([
      db.student.findUnique({
        where: { id: payment.studentId },
        select: {
          firstName: true,
          lastName: true,
          rollNumber: true,
          admissionNumber: true,
          class: { select: { name: true } },
          section: { select: { name: true } },
          parentLinks: { include: { parent: { select: { fatherName: true, motherName: true, phone: true } } } },
        },
      }),
      db.school.findUnique({ where: { id: user.schoolId } }),
    ])
    if (!student) return notFoundError('Student')

    const inventorySaleIds = Array.from(
      new Set(
        credit.creditAllocations
          .map((allocation) => allocation.debitEntry)
          .filter((debit) => debit.sourceType === 'inventory' && !!debit.sourceId)
          .map((debit) => debit.sourceId!)
      )
    )
    const inventorySales = inventorySaleIds.length > 0
      ? await db.inventorySale.findMany({
          where: { schoolId: user.schoolId, id: { in: inventorySaleIds } },
          select: { id: true, receiptNumber: true, discount: true, totalAmount: true },
        })
      : []
    const inventorySalesById = Object.fromEntries(
      inventorySales.map((sale) => [sale.id, { receiptNumber: sale.receiptNumber, discount: sale.discount, totalAmount: sale.totalAmount }])
    )

    const father = student.parentLinks?.find((p) => p.parent?.fatherName)?.parent || null
    const mother = student.parentLinks?.find((p) => p.parent?.motherName)?.parent || null

    let collectedByName: string | null = null
    if (credit.createdBy) {
      const collector = await db.user.findFirst({
        where: { id: credit.createdBy, schoolId: user.schoolId },
        select: { name: true, email: true },
      })
      collectedByName = collector?.name || collector?.email || null
    }

    const html = renderReceiptHtmlFromCredit(credit, {
      school,
      student: { ...student, lastName: student.lastName || '' },
      fatherName: father?.fatherName || null,
      phone: father?.phone || mother?.phone || null,
      academicYear: school?.academicYear || credit.academicYear || '',
      collectedByName,
      inventorySalesById,
      mode: 'parent',
    })

    return new NextResponse(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    })
  } catch (error) {
    console.error('Parent receipt view error:', error)
    return internalError('loading the receipt')
  }
}
