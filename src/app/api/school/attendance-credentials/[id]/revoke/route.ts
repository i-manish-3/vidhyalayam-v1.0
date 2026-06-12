import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError, notFoundError } from '@/lib/api-errors'

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission(request, 'rfid:devices:manage')
    if (!user?.schoolId) return apiError(403, "You don't have permission to manage attendance credentials.")

    const { id } = await params
    const body = await request.json().catch(() => null)
    const reason =
      body && typeof body === 'object' && typeof body.reason === 'string' ? body.reason.trim() : ''

    const existing = await db.attendanceCredential.findFirst({
      where: { id, schoolId: user.schoolId },
      select: { id: true, isActive: true },
    })
    if (!existing) return notFoundError('Attendance credential')
    if (!existing.isActive) return apiError(409, 'This credential is already revoked.')

    const credential = await db.attendanceCredential.update({
      where: { id },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedBy: user.userId,
        revokeReason: reason || null,
      },
    })

    return NextResponse.json({ message: 'Attendance credential revoked.', credential })
  } catch (error) {
    console.error('Revoke attendance credential error:', error)
    return internalError('revoking attendance credential')
  }
}
