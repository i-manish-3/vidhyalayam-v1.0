import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import {
  unauthorizedError,
  forbiddenError,
  internalError,
  apiError,
  notFoundError,
} from '@/lib/api-errors'

// PATCH /api/school/rfid/cards/[id]/revoke
// Body: { reason }
// Marks the card inactive. From this point on, any tap with this card UID
// returns `card_revoked` and does not mark attendance.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'rfid:cards:manage')
    if (!user || !user.schoolId) {
      return user ? forbiddenError() : unauthorizedError()
    }

    const { id } = await params
    if (!id) return apiError(400, 'Card id missing.')

    const body = await request.json().catch(() => null)
    const reason =
      body && typeof body.reason === 'string' ? body.reason.trim() : ''
    if (reason.length < 3) {
      return apiError(
        422,
        'Please add a short reason for revoking this card (lost, damaged, replaced, etc.).',
      )
    }

    // Tenant-scoped read first so we 404 instead of leaking that the id exists
    // for another school.
    const card = await db.studentCard.findFirst({
      where: { id, schoolId: user.schoolId },
      select: { id: true, isActive: true },
    })
    if (!card) return notFoundError('Card')
    if (!card.isActive) {
      return apiError(409, 'This card is already revoked.')
    }

    const updated = await db.studentCard.update({
      where: { id },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedBy: user.userId,
        revokeReason: reason.slice(0, 500),
      },
      select: {
        id: true,
        isActive: true,
        revokedAt: true,
        revokeReason: true,
      },
    })

    return NextResponse.json({ message: 'Card revoked.', card: updated })
  } catch (error) {
    console.error('Revoke RFID card error:', error)
    return internalError('revoking the card')
  }
}
