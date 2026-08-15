import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError, notFoundError } from '@/lib/api-errors'
import { generateCommKey, hashCommKey } from '@/lib/device-comm-key'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission(request, 'rfid:devices:manage')
    if (!user?.schoolId) return apiError(403, "You don't have permission to manage attendance devices.")

    const { id } = await params
    const device = await db.attendanceDevice.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!device) return notFoundError('Attendance device')

    const commKey = generateCommKey()
    await db.attendanceDevice.update({
      where: { id: device.id },
      data: { commKeyHash: hashCommKey(commKey) },
    })

    return NextResponse.json({ commKey })
  } catch (error) {
    console.error('Rotate attendance device comm key error:', error)
    return internalError('rotating the device comm key')
  }
}