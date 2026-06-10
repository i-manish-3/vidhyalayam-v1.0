import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { notificationService } from '@/lib/notifications'
import {
  TICKET_PRIORITIES,
  TICKET_CATEGORIES,
  type TicketPriority,
  type TicketCategory,
} from '@/lib/support-tickets'

const MAX_SUBJECT = 150
const MAX_DESCRIPTION = 4000

// GET /api/school/support — tickets raised by the caller's school.
export async function GET(request: NextRequest) {
  try {
    const user = getAuthUser(request)
    if (!user) return unauthorizedError()
    if (!user.schoolId) return apiError(403, 'Only school accounts can view support tickets.')

    const tickets = await db.supportTicket.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ tickets })
  } catch (error) {
    console.error('List school support tickets error:', error)
    return internalError('loading your support tickets')
  }
}

// POST /api/school/support — raise a support ticket.
// Body: { subject, description, category?, priority? }
export async function POST(request: NextRequest) {
  try {
    const user = getAuthUser(request)
    if (!user) return unauthorizedError()
    if (!user.schoolId) return apiError(403, 'Only school accounts can raise support tickets.')

    const body = await request.json()
    const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const category: TicketCategory = TICKET_CATEGORIES.includes(body.category) ? body.category : 'other'
    const priority: TicketPriority = TICKET_PRIORITIES.includes(body.priority) ? body.priority : 'medium'

    if (!subject) return apiError(400, 'Please enter a subject.')
    if (subject.length > MAX_SUBJECT) return apiError(400, `Subject must be ${MAX_SUBJECT} characters or fewer.`)
    if (!description) return apiError(400, 'Please describe the issue.')
    if (description.length > MAX_DESCRIPTION) {
      return apiError(400, `Description must be ${MAX_DESCRIPTION} characters or fewer.`)
    }

    const ticket = await db.supportTicket.create({
      data: {
        schoolId: user.schoolId,
        userId: user.userId,
        subject,
        description,
        category,
        priority,
        status: 'open',
      },
    })

    // Notify platform owners (best-effort; never block ticket creation).
    void notifySuperAdmins(ticket.subject).catch(() => {})

    return NextResponse.json(ticket, { status: 201 })
  } catch (error) {
    console.error('Create school support ticket error:', error)
    return internalError('submitting your support ticket')
  }
}

/** Fan a "new ticket" in-app notification out to every active SUPER_ADMIN. */
async function notifySuperAdmins(subject: string): Promise<void> {
  const admins = await db.user.findMany({
    where: { role: 'SUPER_ADMIN', isActive: true },
    select: { id: true },
  })
  await Promise.all(
    admins.map((a) =>
      notificationService
        .createNotification({
          schoolId: null,
          userId: a.id,
          title: 'New support ticket',
          message: subject,
          type: 'info',
          module: 'support',
          actionUrl: '/support',
        })
        .catch(() => null),
    ),
  )
}
