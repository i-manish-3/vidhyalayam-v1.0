import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'
import { notificationService } from '@/lib/notifications'
import { TICKET_STATUSES, TICKET_PRIORITIES, type TicketStatus, type TicketPriority } from '@/lib/support-tickets'

// GET /api/super-admin/support-tickets - List support tickets
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || ''
    const priority = searchParams.get('priority') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (priority) where.priority = priority

    const [tickets, total] = await Promise.all([
      db.supportTicket.findMany({
        where,
        include: {
          school: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.supportTicket.count({ where }),
    ])

    return NextResponse.json({
      tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List support tickets error:', error)
    return internalError('loading support tickets')
  }
}

// PATCH /api/super-admin/support-tickets - Update a ticket (status / resolution
// / priority / assignee). Resolving notifies the ticket's creator.
// Body: { id, status?, resolution?, priority?, assignedTo? }
export async function PATCH(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return apiError(400, 'Please specify which ticket to update.')

    const ticket = await db.supportTicket.findUnique({ where: { id } })
    if (!ticket) return notFoundError('SupportTicket')

    const data: Record<string, unknown> = {}

    if (body.status !== undefined) {
      const status = String(body.status).toLowerCase() as TicketStatus
      if (!TICKET_STATUSES.includes(status)) return apiError(400, 'Please choose a valid status.')
      data.status = status
    }
    if (body.priority !== undefined) {
      const priority = String(body.priority).toLowerCase() as TicketPriority
      if (!TICKET_PRIORITIES.includes(priority)) return apiError(400, 'Please choose a valid priority.')
      data.priority = priority
    }
    if (body.resolution !== undefined) {
      data.resolution =
        typeof body.resolution === 'string' && body.resolution.trim() ? body.resolution.trim() : null
    }
    if (body.assignedTo !== undefined) {
      data.assignedTo = typeof body.assignedTo === 'string' && body.assignedTo.trim() ? body.assignedTo.trim() : null
    }

    // Resolving requires a resolution note.
    if (data.status === 'resolved' && !(data.resolution ?? ticket.resolution)) {
      return apiError(400, 'Please add a resolution note before resolving the ticket.')
    }

    const updated = await db.supportTicket.update({ where: { id }, data })

    // Notify the school user who raised it that it was resolved (best-effort).
    const newlyResolved = ticket.status !== 'resolved' && updated.status === 'resolved'
    if (newlyResolved && updated.userId) {
      await notificationService
        .createNotification({
          schoolId: updated.schoolId ?? null,
          userId: updated.userId,
          title: 'Support ticket resolved',
          message: `Your ticket "${updated.subject}" has been resolved.`,
          type: 'info',
          module: 'support',
          actionUrl: '/support',
        })
        .catch(() => {})
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update support ticket error:', error)
    return internalError('updating the support ticket')
  }
}
