import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, forbiddenError, internalError, unauthorizedError, validationError } from '@/lib/api-errors'
import { drainImmediate, ensureBulkWorker } from '@/lib/whatsapp/bulk-worker'

const RECENT_WINDOW_MS = 60 * 60 * 1000 // 1 hour idempotency window

function cleanInt(value: unknown, min: number, max: number): number | null {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) return null
  return n
}

interface PostBody {
  filters?: {
    month?: unknown
    year?: unknown
    classId?: unknown
    sectionId?: unknown
    runId?: unknown
    studentIds?: unknown
  }
  force?: unknown
}

export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const ok = await requirePermission(request, 'fees:create')
      if (!ok) return forbiddenError("You don't have permission to send demand slips.")
    }

    const config = await db.feeDemandConfig.findUnique({ where: { schoolId: user.schoolId } })
    if (!config?.whatsappEnabled || config.whatsappProvider !== 'META_CLOUD') {
      return apiError(400, 'WhatsApp delivery is not enabled. Configure it in Fee Demand settings.')
    }
    if (!config.metaPhoneNumberId || !config.metaAccessToken) {
      return apiError(400, 'Meta Cloud credentials are not set in Fee Demand settings.')
    }

    const body = (await request.json().catch(() => ({}))) as PostBody
    const filters = body.filters || {}
    const month = cleanInt(filters.month, 1, 12)
    const year = cleanInt(filters.year, 2020, 2100)
    if (!month || !year) return validationError('Valid month (1-12) and year (2020-2100) are required in filters.')

    const classId = typeof filters.classId === 'string' ? filters.classId : undefined
    const sectionId = typeof filters.sectionId === 'string' ? filters.sectionId : undefined
    const runId = typeof filters.runId === 'string' ? filters.runId : undefined
    const studentIds = Array.isArray(filters.studentIds)
      ? filters.studentIds.filter((v): v is string => typeof v === 'string')
      : undefined

    const force = body.force === true

    const studentWhere: Prisma.StudentWhereInput = {}
    if (classId) studentWhere.classId = classId
    if (sectionId) studentWhere.sectionId = sectionId

    const slips = await db.studentFeeInvoice.findMany({
      where: {
        schoolId: user.schoolId,
        isMonthlyDemand: true,
        deletedAt: null,
        billingMonth: month,
        billingYear: year,
        ...(runId ? { demandRunId: runId } : {}),
        ...(studentIds ? { studentId: { in: studentIds } } : {}),
        ...(Object.keys(studentWhere).length > 0 ? { student: studentWhere } : {}),
      },
      select: { id: true, studentId: true },
    })

    if (slips.length === 0) {
      return NextResponse.json({ totalQueued: 0, immediatelySent: 0, skipped: 0, message: 'No slips matched the filters.' })
    }

    let queued = 0
    let skipped = 0

    if (!force) {
      const recentRows = await db.feeNotification.findMany({
        where: {
          invoiceId: { in: slips.map((s) => s.id) },
          channel: 'WHATSAPP',
          status: { in: ['sent', 'pending', 'sending'] },
          createdAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) },
        },
        select: { invoiceId: true },
      })
      const recentSet = new Set(recentRows.map((r) => r.invoiceId))

      for (const slip of slips) {
        if (recentSet.has(slip.id)) {
          skipped += 1
          continue
        }
        await db.feeNotification.create({
          data: {
            schoolId: user.schoolId,
            studentId: slip.studentId,
            invoiceId: slip.id,
            channel: 'WHATSAPP',
            provider: 'META_CLOUD',
            recipient: '-', // resolved at send time
            status: 'pending',
          },
        })
        queued += 1
      }
    } else {
      for (const slip of slips) {
        await db.feeNotification.create({
          data: {
            schoolId: user.schoolId,
            studentId: slip.studentId,
            invoiceId: slip.id,
            channel: 'WHATSAPP',
            provider: 'META_CLOUD',
            recipient: '-',
            status: 'pending',
          },
        })
        queued += 1
      }
    }

    ensureBulkWorker()
    const { processed } = await drainImmediate(5)

    return NextResponse.json({
      totalQueued: queued,
      immediatelySent: processed,
      skipped,
    })
  } catch (error) {
    console.error('Bulk send WhatsApp error:', error)
    return internalError('queueing WhatsApp sends')
  }
}
