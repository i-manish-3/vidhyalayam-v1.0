import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/client'
import { sendTextMessage, normalizePhoneE164 } from '@/lib/whatsapp/meta-cloud'
import { decryptToken } from '@/lib/encryption'

/**
 * Channel dispatcher. Delivers a single notification to a single recipient over
 * one external channel and records the attempt in NotificationDelivery.
 *
 * IN_APP is NOT handled here — it is written synchronously by the service when
 * the Notification row is created. This module is invoked by the BullMQ worker
 * (or the sync fallback) for EMAIL / WHATSAPP, and stubs the rest.
 *
 * Every function returns a status instead of throwing, EXCEPT it re-throws on a
 * genuinely transient failure so BullMQ can retry (see worker).
 */

export type NotificationChannel =
  | 'IN_APP'
  | 'EMAIL'
  | 'SMS'
  | 'WHATSAPP'
  | 'WEB_PUSH'
  | 'MOBILE_PUSH'

export interface DispatchArgs {
  notificationId: string
  schoolId: string | null
  userId: string
  channel: NotificationChannel
  title: string
  body: string
  actionUrl?: string | null
}

export interface DispatchResult {
  status: 'sent' | 'failed' | 'skipped'
  providerMsgId?: string
  provider?: string
  recipient?: string
  errorMessage?: string
}

const NOT_IMPLEMENTED: ReadonlyArray<NotificationChannel> = ['SMS', 'WEB_PUSH', 'MOBILE_PUSH']

/** Resolve the recipient address for a channel from the user record. */
async function resolveRecipient(
  userId: string,
  channel: NotificationChannel,
): Promise<{ address: string | null; user: { email: string; phone: string | null } | null }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, phone: true },
  })
  if (!user) return { address: null, user: null }
  if (channel === 'EMAIL') return { address: user.email || null, user }
  if (channel === 'WHATSAPP') {
    const e164 = user.phone ? normalizePhoneE164(user.phone) : null
    return { address: e164, user }
  }
  return { address: null, user }
}

async function sendViaEmail(to: string, title: string, body: string, actionUrl?: string | null): Promise<DispatchResult> {
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6">
    <h2 style="margin:0 0 8px">${escapeHtml(title)}</h2>
    <p style="margin:0 0 12px">${escapeHtml(body).replace(/\n/g, '<br/>')}</p>
    ${actionUrl ? `<p><a href="${escapeHtml(actionUrl)}">View details</a></p>` : ''}
  </div>`
  const res = await sendEmail({ to, subject: title, text: body, html })
  return { status: res.sent || res.via === 'console' ? 'sent' : 'failed', provider: res.via, recipient: to }
}

async function sendViaWhatsApp(schoolId: string, to: string, title: string, body: string): Promise<DispatchResult> {
  const config = await db.feeDemandConfig.findUnique({ where: { schoolId } })
  if (!config?.whatsappEnabled || (config.whatsappProvider !== 'META_CLOUD' && config.whatsappProvider !== 'BAILEYS')) {
    return { status: 'skipped', recipient: to, errorMessage: 'WhatsApp not configured for this school' }
  }
  const message = `*${title}*\n${body}`
  if (config.whatsappProvider === 'BAILEYS') {
    if (!config.baileysConnected) return { status: 'skipped', recipient: to, errorMessage: 'Baileys not connected' }
    // Lazy-load Baileys: its native dep (whatsapp-rust-bridge) has a broken
    // package "exports" map that crashes tsx at import time, so it must stay
    // out of the standalone worker's startup graph. Only loaded when actually
    // sending over Baileys.
    const { sendBaileysMessage } = await import('@/lib/whatsapp/baileys')
    const result = await sendBaileysMessage({ schoolId, toPhoneE164: to, body: message })
    return { status: 'sent', provider: 'BAILEYS', providerMsgId: result.messageId, recipient: to }
  }
  if (!config.metaPhoneNumberId || !config.metaAccessToken) {
    return { status: 'skipped', recipient: to, errorMessage: 'Meta Cloud credentials missing' }
  }
  let accessToken: string
  try {
    accessToken = decryptToken(config.metaAccessToken)
  } catch {
    return { status: 'skipped', recipient: to, errorMessage: 'Stored Meta access token is unreadable' }
  }
  const result = await sendTextMessage({ phoneNumberId: config.metaPhoneNumberId, accessToken }, to, message)
  return { status: 'sent', provider: 'META_CLOUD', providerMsgId: result.messageId, recipient: to }
}

/**
 * Dispatch a single channel delivery and persist the NotificationDelivery row.
 * Throws only on unexpected provider errors so BullMQ retries; expected
 * "can't deliver" cases are recorded as failed/skipped and returned.
 */
export async function dispatchChannel(args: DispatchArgs): Promise<DispatchResult> {
  const { notificationId, schoolId, userId, channel, title, body, actionUrl } = args

  if (channel === 'IN_APP') {
    // Handled by the service; nothing to do here.
    return { status: 'sent', provider: 'in_app' }
  }

  // Record the attempt up front.
  const delivery = await db.notificationDelivery.create({
    data: { notificationId, schoolId, userId, channel, recipient: 'pending', status: 'pending' },
  })

  const finalize = (result: DispatchResult) =>
    db.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: result.status,
        provider: result.provider,
        recipient: result.recipient || 'unknown',
        providerMsgId: result.providerMsgId,
        errorMessage: result.errorMessage,
        attempt: { increment: 1 },
        sentAt: result.status === 'sent' ? new Date() : null,
      },
    })

  if (NOT_IMPLEMENTED.includes(channel)) {
    const result: DispatchResult = { status: 'skipped', errorMessage: `${channel} channel not implemented yet` }
    await finalize(result)
    return result
  }

  const { address } = await resolveRecipient(userId, channel)
  if (!address) {
    const result: DispatchResult = { status: 'failed', errorMessage: `No ${channel} address on file for recipient` }
    await finalize(result)
    return result
  }

  try {
    const result =
      channel === 'EMAIL'
        ? await sendViaEmail(address, title, body, actionUrl)
        : await sendViaWhatsApp(schoolId || '', address, title, body)
    await finalize(result)
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await finalize({ status: 'failed', recipient: address, errorMessage: message })
    // Re-throw so the queue can retry transient provider failures.
    throw err
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
