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

// PATCH /api/school/rfid/devices/[id]
// Body: { isActive?: boolean, name?: string, location?: string }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'rfid:devices:manage')
    if (!user || !user.schoolId) {
      return user ? forbiddenError() : unauthorizedError()
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError(400, 'Body missing.')

    const device = await db.rfidDevice.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!device) return notFoundError('Device')

    const data: { isActive?: boolean; name?: string; location?: string | null } = {}
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive
    if (typeof body.name === 'string') {
      const n = body.name.trim()
      if (n.length < 2) return apiError(422, 'Device name is too short.')
      data.name = n.slice(0, 80)
    }
    if (typeof body.location === 'string') {
      data.location = body.location.trim().slice(0, 120) || null
    }

    const updated = await db.rfidDevice.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        location: true,
        isActive: true,
        lastSeenAt: true,
      },
    })

    return NextResponse.json({ device: updated })
  } catch (error) {
    console.error('Update RFID device error:', error)
    return internalError('updating the device')
  }
}

// DELETE /api/school/rfid/devices/[id] — soft delete
// Also flips isActive=false so any in-flight webhook calls are rejected on
// next request. Tap-log history is retained.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'rfid:devices:manage')
    if (!user || !user.schoolId) {
      return user ? forbiddenError() : unauthorizedError()
    }

    const { id } = await params
    const device = await db.rfidDevice.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!device) return notFoundError('Device')

    await db.rfidDevice.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    })

    return NextResponse.json({ message: 'Device removed.' })
  } catch (error) {
    console.error('Delete RFID device error:', error)
    return internalError('removing the device')
  }
}
