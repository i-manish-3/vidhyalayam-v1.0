import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/school/students/[id]/discontinue-refunds
// Lists refund outcomes from transport/hostel discontinues for this student so
// the UI can show pending cash refunds (with "Mark Refunded") and settled ones.
// Advance-mode refunds show as informational (money is on the fee account).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'fees:read')
    if (!user || !user.schoolId) return unauthorizedError()
    const { id: studentId } = await params

    const where = {
      schoolId: user.schoolId,
      studentId,
      eventType: 'WITHDRAWN',
      refundStatus: { in: ['advanced', 'pending', 'settled'] },
    }
    const select = {
      id: true, effectiveDate: true, refundMode: true, refundAmount: true,
      refundStatus: true, refundMethod: true, refundSettledAt: true, createdAt: true,
    }
    const [transport, hostel] = await Promise.all([
      db.transportEvent.findMany({ where, select, orderBy: { createdAt: 'desc' } }),
      db.hostelEvent.findMany({ where, select, orderBy: { createdAt: 'desc' } }),
    ])

    const refunds = [
      ...transport.map((e) => ({ ...e, scope: 'transport' as const })),
      ...hostel.map((e) => ({ ...e, scope: 'hostel' as const })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const pendingCash = refunds
      .filter((r) => r.refundStatus === 'pending')
      .reduce((sum, r) => sum + r.refundAmount, 0)

    return NextResponse.json({ refunds, pendingCash })
  } catch (error) {
    console.error('GET /students/[id]/discontinue-refunds failed:', error)
    return internalError('loading discontinue refunds')
  }
}
