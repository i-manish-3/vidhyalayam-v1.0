import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError, validationError } from '@/lib/api-errors'
import { decryptToken } from '@/lib/encryption'
import { sendTextMessage, normalizePhoneE164 } from '@/lib/whatsapp/meta-cloud'

interface PostBody {
  toPhone?: unknown
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'settings:update')
    if (!user?.schoolId) return unauthorizedError()

    const body = (await request.json().catch(() => ({}))) as PostBody
    const rawPhone = typeof body.toPhone === 'string' ? body.toPhone : ''
    const e164 = normalizePhoneE164(rawPhone)
    if (!e164) return validationError('Provide a valid phone number including country code (e.g. +919876543210).')

    const config = await db.feeDemandConfig.findUnique({ where: { schoolId: user.schoolId } })
    if (!config?.metaPhoneNumberId || !config?.metaAccessToken) {
      return apiError(400, 'Save the Meta phone-number-id and access token first, then test.')
    }

    let token: string
    try {
      token = decryptToken(config.metaAccessToken)
    } catch {
      return apiError(400, 'Stored access token is unreadable. Re-enter it and save.')
    }

    const result = await sendTextMessage(
      { phoneNumberId: config.metaPhoneNumberId, accessToken: token },
      e164,
      'Test message from your school ERP. WhatsApp delivery is configured correctly.'
    )

    return NextResponse.json({ success: true, recipient: e164, messageId: result.messageId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Test failed'
    return apiError(500, message)
  }
}
