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
    if (!user?.schoolId) return apiError(403, "You don't have permission to manage attendance devices.")

    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError(400, 'Body missing.')

    const existing = await db.attendanceDevice.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!existing) return notFoundError('Attendance device')

    const data: {
      name?: string
      location?: string | null
      isActive?: boolean
    } = {}

    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (name.length < 2) return apiError(422, 'Device name is too short.')
      data.name = name
    }
    if (typeof body.location === 'string') {
      data.location = body.location.trim() || null
    }
    if (typeof body.isActive === 'boolean') {
      data.isActive = body.isActive
    }

    const device = await db.attendanceDevice.update({
      where: { id },
      data,
    })

    return NextResponse.json({ device })
  } catch (error) {
    console.error('Update attendance device error:', error)
    return internalError('updating attendance device')
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission(_request, 'rfid:devices:manage')
    if (!user?.schoolId) return apiError(403, "You don't have permission to manage attendance devices.")

    const { id } = await params
    const existing = await db.attendanceDevice.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!existing) return notFoundError('Attendance device')

    await db.attendanceDevice.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    })

    return NextResponse.json({ message: 'Attendance device removed.' })
  } catch (error) {
    console.error('Remove attendance device error:', error)
    return internalError('removing attendance device')
  }
}
