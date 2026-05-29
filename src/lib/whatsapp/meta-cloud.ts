// Meta WhatsApp Business Cloud API client.
// Stateless HTTP wrapper around POST /v21.0/{phoneNumberId}/messages.
// Caller is responsible for auth check, decryption (`decryptToken`), and DB
// persistence of FeeNotification rows. This file just talks to Meta.

const META_API_VERSION = 'v21.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

export interface MetaCredentials {
  phoneNumberId: string
  accessToken: string // already decrypted
}

interface MetaSendResponse {
  messaging_product?: string
  contacts?: Array<{ input: string; wa_id: string }>
  messages?: Array<{ id: string }>
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

export interface SendResult {
  messageId: string
}

// Normalize a phone number into E.164 (`+<country><national>`).
// India default: bare 10-digit numbers get +91 prefix. Non-Indian numbers
// must already include the country code (with or without leading +).
export function normalizePhoneE164(input: string): string | null {
  if (!input) return null
  const stripped = input.replace(/[\s\-()]/g, '').trim()
  if (!stripped) return null

  if (stripped.startsWith('+')) {
    const digits = stripped.slice(1)
    if (!/^\d{8,15}$/.test(digits)) return null
    return `+${digits}`
  }

  if (/^\d{10}$/.test(stripped)) return `+91${stripped}`
  if (/^91\d{10}$/.test(stripped)) return `+${stripped}`
  if (/^\d{11,15}$/.test(stripped)) return `+${stripped}`
  return null
}

async function postToMeta(
  creds: MetaCredentials,
  body: Record<string, unknown>
): Promise<SendResult> {
  const url = `${META_BASE_URL}/${encodeURIComponent(creds.phoneNumberId)}/messages`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new Error(`Network error reaching Meta: ${err instanceof Error ? err.message : String(err)}`)
  }

  let data: MetaSendResponse | null = null
  try {
    data = (await response.json()) as MetaSendResponse
  } catch {
    // Non-JSON response — fall through to status-based error.
  }

  if (!response.ok || data?.error) {
    const meta = data?.error
    const detail = meta?.message || `HTTP ${response.status}`
    const code = meta?.code ? ` (code ${meta.code})` : ''
    throw new Error(`Meta API error: ${detail}${code}`)
  }

  const messageId = data?.messages?.[0]?.id
  if (!messageId) throw new Error('Meta API returned no message id')
  return { messageId }
}

export async function sendTextMessage(
  creds: MetaCredentials,
  toPhoneE164: string,
  body: string
): Promise<SendResult> {
  const to = toPhoneE164.startsWith('+') ? toPhoneE164.slice(1) : toPhoneE164
  return postToMeta(creds, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: true, body },
  })
}

export async function sendTemplateMessage(
  creds: MetaCredentials,
  toPhoneE164: string,
  templateName: string,
  params: string[],
  languageCode = 'en_US'
): Promise<SendResult> {
  const to = toPhoneE164.startsWith('+') ? toPhoneE164.slice(1) : toPhoneE164
  return postToMeta(creds, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: params.length > 0
        ? [
            {
              type: 'body',
              parameters: params.map((value) => ({ type: 'text', text: value })),
            },
          ]
        : [],
    },
  })
}
