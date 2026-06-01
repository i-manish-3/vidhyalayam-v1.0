import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { internalError, apiError } from '@/lib/api-errors'
import { ingestTap } from '@/lib/attendance-tap-service'
import { hashDeviceKey } from '@/lib/rfid-device-auth'

/**
 * POST /api/rfid/webhook
 *
 * Public-facing endpoint for networked RFID readers (ESP32 / commercial gate
 * readers). No cookie/JWT auth — devices have no browser session. Instead:
 *
 *   Headers:
 *     x-device-key: <plaintext-key>
 *
 *   Body (JSON):
 *     {
 *       "uid": "045AB28E",          // required; reader-emitted card UID
 *       "tappedAt": "ISO8601"       // optional; server time wins if skew > 5min
 *     }
 *
 * Auth flow: hash the plaintext key (SHA-256) → match against RfidDevice.apiKeyHash.
 * The schoolId comes from the device row, never from the request — so a
 * compromised device can only mark attendance for the school it was issued to.
 */
export async function POST(request: NextRequest) {
  try {
    const plaintextKey = request.headers.get('x-device-key')
    if (!plaintextKey) return apiError(401, 'Missing device key.')

    const apiKeyHash = hashDeviceKey(plaintextKey)
    const device = await db.rfidDevice.findFirst({
      where: {
        apiKeyHash,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, schoolId: true },
    })
    if (!device) return apiError(401, 'Device key not recognized.')

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError(400, 'Tap payload missing.')

    const rawUid = typeof body.uid === 'string' ? body.uid : ''
    if (!rawUid) return apiError(400, 'Card UID missing.')

    let tappedAt: Date | undefined
    if (typeof body.tappedAt === 'string') {
      const parsed = new Date(body.tappedAt)
      if (!Number.isNaN(parsed.getTime())) tappedAt = parsed
    }

    const result = await ingestTap({
      schoolId: device.schoolId,
      uid: rawUid,
      source: 'webhook',
      deviceId: device.id,
      performedBy: null,
      tappedAt,
    })

    // Compact response for embedded reader firmware (LCD / buzzer feedback).
    return NextResponse.json({
      result: result.result,
      studentName: result.student
        ? `${result.student.firstName} ${result.student.lastName}`
        : null,
      className: result.student?.className ?? null,
      message: result.message ?? null,
    })
  } catch (error) {
    console.error('RFID webhook error:', error)
    return internalError('processing the tap')
  }
}
