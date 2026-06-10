import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'
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

// GET /api/super-admin/announcements/[id] — single announcement detail.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const { id } = await params
    const announcement = await db.platformAnnouncement.findUnique({
      where: { id },
      include: { _count: { select: { dismissals: true } } },
    })
    if (!announcement) return notFoundError('Announcement')

    return NextResponse.json(serializeAnnouncement(announcement))
  } catch (error) {
    console.error('Get platform announcement error:', error)
    return internalError('loading the announcement')
  }
}

// PATCH /api/super-admin/announcements/[id] — edit / activate / archive.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const { id } = await params
    const existing = await db.platformAnnouncement.findUnique({ where: { id } })
    if (!existing) return notFoundError('Announcement')

    const body = await request.json()
    const data: Record<string, unknown> = {}

    if (body.title !== undefined) {
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      if (!title) return apiError(400, 'Please enter a title for the announcement.')
      if (title.length > MAX_TITLE) return apiError(400, `Title must be ${MAX_TITLE} characters or fewer.`)
      data.title = title
    }
    if (body.message !== undefined) {
      const message = typeof body.message === 'string' ? body.message.trim() : ''
      if (!message) return apiError(400, 'Please enter a message for the announcement.')
      if (message.length > MAX_MESSAGE) {
        return apiError(400, `Message must be ${MAX_MESSAGE} characters or fewer.`)
      }
      data.message = message
    }
    if (body.severity !== undefined) {
      if (!SEVERITIES.includes(body.severity as AnnouncementSeverity)) {
        return apiError(400, 'Please choose a valid severity.')
      }
      data.severity = body.severity
    }
    if (body.audience !== undefined) {
      if (!AUDIENCES.includes(body.audience as AnnouncementAudience)) {
        return apiError(400, 'Please choose a valid audience.')
      }
      data.audience = body.audience
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as AnnouncementStatus)) {
        return apiError(400, 'Please choose a valid status.')
      }
      data.status = body.status
    }
    if (body.dismissible !== undefined) data.dismissible = Boolean(body.dismissible)
    if (body.linkUrl !== undefined) {
      const linkUrl = sanitizeLinkUrl(body.linkUrl)
      if (linkUrl === false) return apiError(400, 'The link URL must be a valid http(s):// address.')
      data.linkUrl = linkUrl
    }
    if (body.linkLabel !== undefined) {
      data.linkLabel =
        typeof body.linkLabel === 'string' && body.linkLabel.trim()
          ? body.linkLabel.trim().slice(0, MAX_LINK_LABEL)
          : null
    }
    if (body.startsAt !== undefined) {
      const startsAt = parseOptionalDate(body.startsAt)
      if (startsAt === false) return apiError(400, 'The start date is invalid. Please pick a valid date.')
      data.startsAt = startsAt
    }
    if (body.expiresAt !== undefined) {
      const expiresAt = parseOptionalDate(body.expiresAt)
      if (expiresAt === false) return apiError(400, 'The end date is invalid. Please pick a valid date.')
      data.expiresAt = expiresAt
    }

    // Validate the resulting window (use incoming value or fall back to existing).
    const effStart = (data.startsAt as Date | null | undefined) ?? existing.startsAt
    const effEnd = (data.expiresAt as Date | null | undefined) ?? existing.expiresAt
    if (effStart && effEnd && effEnd.getTime() <= effStart.getTime()) {
      return apiError(400, 'The end date must be after the start date.')
    }

    const updated = await db.platformAnnouncement.update({
      where: { id },
      data,
      include: { _count: { select: { dismissals: true } } },
    })

    // Push live only on the transition into active — not on every edit of an
    // already-live banner (that would fan out a re-fetch to every client per save).
    const becameActive = existing.status !== 'active' && updated.status === 'active'
    if (becameActive) {
      await publishToPlatform({ event: 'platform:announcement', data: { id: updated.id } })
    }

    return NextResponse.json(serializeAnnouncement(updated))
  } catch (error) {
    console.error('Update platform announcement error:', error)
    return internalError('updating the announcement')
  }
}

// DELETE /api/super-admin/announcements/[id] — drafts only; archive active ones.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const { id } = await params
    const existing = await db.platformAnnouncement.findUnique({ where: { id } })
    if (!existing) return notFoundError('Announcement')

    if (existing.status === 'active') {
      return apiError(409, 'This announcement is live. Please archive it before deleting.')
    }

    await db.platformAnnouncement.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete platform announcement error:', error)
    return internalError('deleting the announcement')
  }
}
