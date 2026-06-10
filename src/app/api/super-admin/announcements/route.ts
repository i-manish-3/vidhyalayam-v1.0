import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { publishToPlatform } from '@/lib/notifications/realtime'
import {
  SEVERITIES,
  STATUSES,
  AUDIENCES,
  MAX_TITLE,
  MAX_MESSAGE,
  MAX_LINK_LABEL,
  serializeAnnouncement,
  parseOptionalDate,
  sanitizeLinkUrl,
  type AnnouncementSeverity,
  type AnnouncementStatus,
  type AnnouncementAudience,
} from '@/lib/platform-announcements'

// GET /api/super-admin/announcements — list all platform announcements.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (status && STATUSES.includes(status as AnnouncementStatus)) {
      where.status = status
    }

    const announcements = await db.platformAnnouncement.findMany({
      where,
      include: { _count: { select: { dismissals: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({ announcements: announcements.map(serializeAnnouncement) })
  } catch (error) {
    console.error('List platform announcements error:', error)
    return internalError('loading platform announcements')
  }
}

// POST /api/super-admin/announcements — create a platform announcement.
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const body = await request.json()
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const severity: AnnouncementSeverity = SEVERITIES.includes(body.severity) ? body.severity : 'info'
    const audience: AnnouncementAudience = AUDIENCES.includes(body.audience) ? body.audience : 'all'
    const status: AnnouncementStatus = STATUSES.includes(body.status) ? body.status : 'draft'
    const dismissible = body.dismissible === undefined ? true : Boolean(body.dismissible)
    const linkLabel =
      typeof body.linkLabel === 'string' && body.linkLabel.trim()
        ? body.linkLabel.trim().slice(0, MAX_LINK_LABEL)
        : null

    if (!title) return apiError(400, 'Please enter a title for the announcement.')
    if (!message) return apiError(400, 'Please enter a message for the announcement.')
    if (title.length > MAX_TITLE) return apiError(400, `Title must be ${MAX_TITLE} characters or fewer.`)
    if (message.length > MAX_MESSAGE) {
      return apiError(400, `Message must be ${MAX_MESSAGE} characters or fewer.`)
    }

    const linkUrl = sanitizeLinkUrl(body.linkUrl)
    if (linkUrl === false) {
      return apiError(400, 'The link URL must be a valid http(s):// address.')
    }

    const startsAt = parseOptionalDate(body.startsAt)
    const expiresAt = parseOptionalDate(body.expiresAt)
    if (startsAt === false) return apiError(400, 'The start date is invalid. Please pick a valid date.')
    if (expiresAt === false) return apiError(400, 'The end date is invalid. Please pick a valid date.')
    if (startsAt && expiresAt && expiresAt.getTime() <= startsAt.getTime()) {
      return apiError(400, 'The end date must be after the start date.')
    }

    const created = await db.platformAnnouncement.create({
      data: {
        title,
        message,
        severity,
        status,
        audience,
        dismissible,
        linkUrl,
        linkLabel,
        startsAt: startsAt || null,
        expiresAt: expiresAt || null,
        createdBy: user.userId,
      },
      include: { _count: { select: { dismissals: true } } },
    })

    // Live-push only when it is immediately visible.
    if (created.status === 'active') {
      await publishToPlatform({ event: 'platform:announcement', data: { id: created.id } })
    }

    return NextResponse.json(serializeAnnouncement(created), { status: 201 })
  } catch (error) {
    console.error('Create platform announcement error:', error)
    return internalError('creating the announcement')
  }
}
