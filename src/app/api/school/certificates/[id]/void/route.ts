import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'

// POST /api/school/certificates/[id]/void
// Marks a certificate as void (e.g. issued in error). The row is kept for
// audit — voided certificates never disappear from records.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'certificate:void')
    if (!user?.schoolId) return apiError(403, "You don't have permission to void certificates.")
    const { id } = await params

    const certificate = await db.certificate.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, status: true },
    })
    if (!certificate) return apiError(404, 'Certificate not found')
    if (certificate.status === 'void') return apiError(409, 'Certificate is already void.')

    const body = await request.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) return apiError(422, 'A void reason is required.')

    const updated = await db.certificate.update({
      where: { id },
      data: { status: 'void', voidedAt: new Date(), voidedBy: user.userId, voidReason: reason },
    })

    return NextResponse.json({ certificate: updated })
  } catch (error) {
    console.error('Void certificate error:', error)
    return internalError('voiding certificate')
  }
}