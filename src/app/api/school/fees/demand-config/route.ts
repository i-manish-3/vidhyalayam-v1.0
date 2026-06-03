import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import {
  apiError,
  forbiddenError,
  internalError,
  unauthorizedError,
} from '@/lib/api-errors'
import { decryptToken, encryptToken, maskToken } from '@/lib/encryption'
import { logConfigChange, extractAuditContext } from '@/lib/audit'

// Sentinel string the UI sends back when a sensitive field is unchanged.
// We never send the raw token down to the browser (only the mask), so the
// client posts this back to indicate "leave token alone" on save.
const UNCHANGED = '__UNCHANGED__'

const VALID_PROVIDERS = new Set(['BAILEYS', 'META_CLOUD'])
const VALID_FEE_TYPES = new Set(['FLAT', 'PER_DAY'])

function cleanInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value)
  if (!Number.isInteger(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function cleanFloat(value: unknown, fallback: number, min: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(n, min)
}

function cleanBool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t || null
}

// Build the response shape — never expose raw encrypted tokens.
// metaAccessTokenMask is what the UI shows; metaAccessTokenSet tells the UI
// whether a value exists so it can render "Configured · click to replace".
function serializeConfig(c: Awaited<ReturnType<typeof db.feeDemandConfig.upsert>>) {
  let metaAccessTokenMask = ''
  let metaAccessTokenSet = false
  if (c.metaAccessToken) {
    metaAccessTokenSet = true
    try {
      metaAccessTokenMask = maskToken(decryptToken(c.metaAccessToken))
    } catch {
      // Stored value unreadable (key rotated / corruption). Surface generically.
      metaAccessTokenMask = '••••••••'
    }
  }

  return {
    dueDay: c.dueDay,
    slipNumberFormat: c.slipNumberFormat,
    lateFeeEnabled: c.lateFeeEnabled,
    lateFeeType: c.lateFeeType,
    lateFeeAmount: c.lateFeeAmount,
    lateFeeGraceDays: c.lateFeeGraceDays,
    whatsappEnabled: c.whatsappEnabled,
    whatsappProvider: c.whatsappProvider,
    metaPhoneNumberId: c.metaPhoneNumberId,
    metaAccessTokenMask,
    metaAccessTokenSet,
    metaBusinessId: c.metaBusinessId,
    metaTemplateName: c.metaTemplateName,
    baileysConnected: c.baileysConnected,
    baileysPhoneNumber: c.baileysPhoneNumber,
    baileysLastActiveAt: c.baileysLastActiveAt,
    updatedAt: c.updatedAt,
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const ok = await requirePermission(request, 'fees:read')
      if (!ok) return forbiddenError("You don't have access to fee demand settings.")
    }

    const config = await db.feeDemandConfig.upsert({
      where: { schoolId: user.schoolId },
      update: {},
      create: { school: { connect: { id: user.schoolId } } },
    })

    return NextResponse.json({ config: serializeConfig(config) })
  } catch (error) {
    console.error('Load fee demand config error:', error)
    return internalError('loading fee demand settings')
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user?.schoolId) return unauthorizedError()

    const body = await request.json()

    const dueDay = cleanInt(body.dueDay, 10, 1, 28)
    const slipNumberFormat = typeof body.slipNumberFormat === 'string' && body.slipNumberFormat.trim()
      ? body.slipNumberFormat.trim()
      : 'DS/{academicYear}/{month}/{sequence}'

    const lateFeeEnabled = cleanBool(body.lateFeeEnabled, false)
    const lateFeeType = (typeof body.lateFeeType === 'string' && VALID_FEE_TYPES.has(body.lateFeeType))
      ? body.lateFeeType
      : 'FLAT'
    const lateFeeAmount = cleanFloat(body.lateFeeAmount, 0, 0)
    const lateFeeGraceDays = cleanInt(body.lateFeeGraceDays, 0, 0, 60)

    const whatsappEnabled = cleanBool(body.whatsappEnabled, false)
    const rawProvider = typeof body.whatsappProvider === 'string' ? body.whatsappProvider : null
    const whatsappProvider = rawProvider && VALID_PROVIDERS.has(rawProvider) ? rawProvider : null

    if (whatsappEnabled && !whatsappProvider) {
      return apiError(400, 'Choose a WhatsApp provider before enabling delivery.')
    }

    const metaPhoneNumberId = cleanText(body.metaPhoneNumberId)
    const metaBusinessId = cleanText(body.metaBusinessId)
    const metaTemplateName = cleanText(body.metaTemplateName)

    // Token handling: client sends UNCHANGED → keep what's in DB.
    // Empty string → clear the token. Real string → encrypt + store.
    let metaTokenUpdate: { set?: string | null } | undefined
    if (body.metaAccessToken === undefined || body.metaAccessToken === UNCHANGED) {
      metaTokenUpdate = undefined
    } else if (typeof body.metaAccessToken === 'string' && body.metaAccessToken.trim() === '') {
      metaTokenUpdate = { set: null }
    } else if (typeof body.metaAccessToken === 'string') {
      metaTokenUpdate = { set: encryptToken(body.metaAccessToken.trim()) }
    }

    const baseData = {
      dueDay,
      slipNumberFormat,
      lateFeeEnabled,
      lateFeeType,
      lateFeeAmount,
      lateFeeGraceDays,
      whatsappEnabled,
      whatsappProvider,
      metaPhoneNumberId,
      metaBusinessId,
      metaTemplateName,
    }

    // Fetch old config for audit trail
    const oldConfig = await db.feeDemandConfig.findUnique({
      where: { schoolId: user.schoolId },
    })

    const config = await db.$transaction(async (tx) => {
      const updated = await tx.feeDemandConfig.upsert({
        where: { schoolId: user.schoolId },
        create: {
          schoolId: user.schoolId,
          ...baseData,
          metaAccessToken: metaTokenUpdate?.set ?? null,
        },
        update: {
          ...baseData,
          ...(metaTokenUpdate ? { metaAccessToken: metaTokenUpdate.set } : {}),
        },
      })

      // Log configuration change
      const auditContext = extractAuditContext(request, user.userId)
      await logConfigChange(
        tx,
        user.schoolId,
        'FeeDemandConfig',
        updated.id,
        oldConfig ? 'updated' : 'created',
        oldConfig,
        updated,
        auditContext
      )

      return updated
    })

    return NextResponse.json({ config: serializeConfig(config) })
  } catch (error) {
    console.error('Update fee demand config error:', error)
    return internalError('saving fee demand settings')
  }
}
