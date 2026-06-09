import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

const CHANNELS = ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'WEB_PUSH', 'MOBILE_PUSH']

// GET /api/school/notification-templates
// Returns the school's own templates plus the system templates it can override.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user) return unauthorizedError()

    const { searchParams } = new URL(request.url)
    const moduleName = searchParams.get('module')

    const templates = await db.notificationTemplate.findMany({
      where: {
        OR: [{ schoolId: user.schoolId ?? null }, { schoolId: null }],
        ...(moduleName ? { module: moduleName } : {}),
      },
      orderBy: [{ module: 'asc' }, { key: 'asc' }, { channel: 'asc' }],
    })
    return NextResponse.json({ templates, channels: CHANNELS })
  } catch (error) {
    console.error('List templates error:', error)
    return internalError('listing notification templates')
  }
}

// POST /api/school/notification-templates - create/override a school template
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'notification:template:manage')
    if (!user || !user.schoolId) return unauthorizedError()

    const body = await request.json()
    const { key, module: moduleName, channel = 'IN_APP', title, body: messageBody } = body

    if (!key || !moduleName || !title || !messageBody) {
      return apiError(400, 'Please provide key, module, title and body.')
    }
    if (!CHANNELS.includes(channel)) return apiError(400, 'Invalid channel.')

    const template = await db.notificationTemplate.upsert({
      where: { schoolId_key_channel: { schoolId: user.schoolId, key, channel } },
      update: { module: moduleName, title, body: messageBody, isActive: true },
      create: { schoolId: user.schoolId, key, module: moduleName, channel, title, body: messageBody },
    })
    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error('Create template error:', error)
    return internalError('creating the notification template')
  }
}
