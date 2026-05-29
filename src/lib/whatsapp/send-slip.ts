import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { decryptToken } from '@/lib/encryption'
import { sendTemplateMessage, sendTextMessage, normalizePhoneE164 } from './meta-cloud'
import { sendBaileysMessage } from './baileys'

const PUBLIC_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000

const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function publicAppUrl(): string {
  const raw = (process.env.PUBLIC_APP_URL || 'http://localhost:3000').trim()
  return raw.replace(/\/$/, '')
}

function fmtINR(value: number): string {
  return `₹${(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(value: Date | null | undefined): string {
  if (!value) return '-'
  try {
    return value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '-' }
}

export interface SendArgs {
  schoolId: string
  invoiceId: string
  triggeredBy?: string | null
  // 'text' uses session messaging (only valid within Meta's 24h customer-care
  // window, but free-tier sandbox allows it for verified test recipients).
  // 'template' uses an approved Meta template — required for cold outreach.
  mode?: 'text' | 'template'
}

export async function sendSlipViaWhatsApp(args: SendArgs) {
  const { schoolId, invoiceId, triggeredBy, mode = 'text' } = args

  const invoice = await db.studentFeeInvoice.findFirst({
    where: { id: invoiceId, schoolId, isMonthlyDemand: true, deletedAt: null },
    include: {
      school: true,
      student: {
        include: {
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          parentLinks: {
            include: {
              parent: { select: { id: true, fatherName: true, motherName: true, phone: true, alternatePhone: true } },
            },
          },
        },
      },
    },
  })
  if (!invoice) throw new Error('Demand slip not found')

  const config = await db.feeDemandConfig.findUnique({ where: { schoolId } })
  if (!config?.whatsappEnabled) {
    throw new Error('WhatsApp delivery is not enabled. Configure it in Fee Demand settings.')
  }
  if (config.whatsappProvider !== 'META_CLOUD' && config.whatsappProvider !== 'BAILEYS') {
    throw new Error('Pick a WhatsApp provider in Fee Demand settings.')
  }

  let accessToken: string | null = null
  if (config.whatsappProvider === 'META_CLOUD') {
    if (!config.metaPhoneNumberId || !config.metaAccessToken) {
      throw new Error('Meta Cloud credentials missing. Set them in Fee Demand settings.')
    }
    try {
      accessToken = decryptToken(config.metaAccessToken)
    } catch {
      throw new Error('Stored Meta access token is unreadable. Re-enter it in settings.')
    }
  } else {
    // Baileys provider: only requirement is a saved session. Connection itself
    // is lazily spawned inside sendBaileysMessage; if the session is missing,
    // the call below throws with a clear message.
    if (!config.baileysConnected) {
      throw new Error('Baileys is not connected. Scan the QR in Fee Demand settings first.')
    }
  }

  const links = invoice.student.parentLinks
  const sortedLinks = [...links].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  let recipient: string | null = null
  for (const link of sortedLinks) {
    const phone = link.parent.phone || link.parent.alternatePhone
    const e164 = phone ? normalizePhoneE164(phone) : null
    if (e164) {
      recipient = e164
      break
    }
  }

  if (!recipient) {
    return db.feeNotification.create({
      data: {
        schoolId,
        studentId: invoice.studentId,
        invoiceId: invoice.id,
        channel: 'WHATSAPP',
        provider: config.whatsappProvider,
        recipient: '-',
        status: 'failed',
        errorMessage: 'No parent phone number on file',
      },
    })
  }

  let token = invoice.publicAccessToken
  let tokenExpiresAt = invoice.publicTokenExpiresAt
  const now = new Date()
  const tokenStale = !token || (tokenExpiresAt && tokenExpiresAt < now)
  if (tokenStale) {
    token = crypto.randomBytes(32).toString('hex')
    tokenExpiresAt = new Date(now.getTime() + PUBLIC_TOKEN_TTL_MS)
    await db.studentFeeInvoice.update({
      where: { id: invoice.id },
      data: { publicAccessToken: token, publicTokenExpiresAt: tokenExpiresAt },
    })
  }

  const monthLabel = MONTH_LABELS[(invoice.billingMonth || 1) - 1]
  const studentName = `${invoice.student.firstName} ${invoice.student.lastName}`.trim()
  const classLabel = [invoice.student.class?.name, invoice.student.section?.name].filter(Boolean).join('/')
  const url = `${publicAppUrl()}/d/${token}`
  const total = fmtINR(invoice.totalAmount || 0)
  const due = fmtDate(invoice.dueDate)

  const notification = await db.feeNotification.create({
    data: {
      schoolId,
      studentId: invoice.studentId,
      invoiceId: invoice.id,
      channel: 'WHATSAPP',
      provider: config.whatsappProvider,
      recipient,
      status: 'pending',
    },
  })

  try {
    let messageId: string
    const body = [
      invoice.school.name,
      `Fee Demand Slip · ${monthLabel} ${invoice.billingYear}`,
      `Student: ${studentName}${invoice.student.admissionNumber ? ` (${invoice.student.admissionNumber})` : ''}`,
      classLabel ? `Class: ${classLabel}` : '',
      '',
      `Total Demanded: ${total}`,
      `Due Date: ${due}`,
      '',
      `View & download: ${url}`,
    ].filter(Boolean).join('\n')

    if (config.whatsappProvider === 'BAILEYS') {
      const result = await sendBaileysMessage({ schoolId, toPhoneE164: recipient, body })
      messageId = result.messageId
    } else if (mode === 'template' && config.metaTemplateName) {
      const result = await sendTemplateMessage(
        { phoneNumberId: config.metaPhoneNumberId!, accessToken: accessToken! },
        recipient,
        config.metaTemplateName,
        [studentName, monthLabel, total, due, url]
      )
      messageId = result.messageId
    } else {
      const result = await sendTextMessage(
        { phoneNumberId: config.metaPhoneNumberId!, accessToken: accessToken! },
        recipient,
        body
      )
      messageId = result.messageId
    }

    const updated = await db.feeNotification.update({
      where: { id: notification.id },
      data: {
        status: 'sent',
        providerMsgId: messageId,
        sentAt: new Date(),
      },
    })

    await db.studentFeeInvoice.update({
      where: { id: invoice.id },
      data: { sharedAt: new Date() },
    })

    return updated
  } catch (err) {
    return db.feeNotification.update({
      where: { id: notification.id },
      data: {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    })
  } finally {
    void triggeredBy // documented param; not stored on FeeNotification (could be added later)
  }
}
