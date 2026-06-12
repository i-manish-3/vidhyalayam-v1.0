import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError } from '@/lib/api-errors'
import { getParentChildStudentIds } from '@/lib/parent-access'
import { renderDemandSlipHtml } from '@/lib/fee-slip-render'

// GET /api/parent/demand-slips/[id]/view — printable demand-slip HTML for one of
// the parent's children. Opened in a new tab from the portal.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRole(request, ['PARENT'])
    if (!user || !user.schoolId) return unauthorizedError()

    const { id } = await params
    const childIds = await getParentChildStudentIds(user.userId, user.schoolId)
    if (childIds.length === 0) return unauthorizedError()

    const slip = await db.studentFeeInvoice.findFirst({
      where: {
        id,
        schoolId: user.schoolId,
        studentId: { in: childIds },
        isMonthlyDemand: true,
        deletedAt: null,
      },
      include: {
        school: true,
        student: {
          include: {
            class: { select: { name: true } },
            section: { select: { name: true } },
            parentLinks: {
              include: { parent: { select: { fatherName: true, motherName: true, phone: true } } },
            },
          },
        },
        lines: {
          include: { assignmentItem: { select: { assignment: { select: { academicYear: true } } } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!slip) return notFoundError('Demand slip')

    const html = await renderDemandSlipHtml(slip, { mode: 'parent' })
    return new NextResponse(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    })
  } catch (error) {
    console.error('Parent demand-slip view error:', error)
    return internalError('loading the demand slip')
  }
}
