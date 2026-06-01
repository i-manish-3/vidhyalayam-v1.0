import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import {
  unauthorizedError,
  forbiddenError,
  internalError,
  apiError,
} from '@/lib/api-errors'
import { generateDeviceKey, hashDeviceKey } from '@/lib/rfid-device-auth'

// GET /api/school/rfid/devices — list (admin overview)
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'rfid:devices:manage')
    if (!user || !user.schoolId) {
      return user ? forbiddenError() : unauthorizedError()
    }

    const devices = await db.rfidDevice.findMany({
      where: { schoolId: user.schoolId, deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        location: true,
        isActive: true,
        lastSeenAt: true,
        lastSeenIp: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ devices })
  } catch (error) {
    console.error('List RFID devices error:', error)
    return internalError('loading devices')
  }
}

// POST /api/school/rfid/devices — create
// Body: { name, location? }
// Returns the plaintext API key ONCE in the response. The plaintext is never
// stored or shown again — admin must copy it now to paste into the reader
// firmware. Lost a key? Delete the device and recreate.
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'rfid:devices:manage')
    if (!user || !user.schoolId) {
      return user ? forbiddenError() : unauthorizedError()
    }

    const body = await request.json().catch(() => null)
    const name =
      body && typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
    const location =
      body && typeof body.location === 'string'
        ? body.location.trim().slice(0, 120) || null
        : null

    if (name.length < 2) {
      return apiError(422, 'Please give this device a short name (e.g. "Main Gate").')
    }

    const plaintext = generateDeviceKey()
    const apiKeyHash = hashDeviceKey(plaintext)

    const device = await db.rfidDevice.create({
      data: {
        schoolId: user.schoolId,
        name,
        location,
        apiKeyHash,
        createdBy: user.userId,
      },
      select: {
        id: true,
        name: true,
        location: true,
        isActive: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      message:
        'Device created. Copy the key now — it will not be shown again.',
      device,
      apiKey: plaintext,
    })
  } catch (error) {
    console.error('Create RFID device error:', error)
    return internalError('creating the device')
  }
}
