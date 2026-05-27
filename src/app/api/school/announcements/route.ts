import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/announcements - List announcements
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF', 'STUDENT', 'PARENT'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const audience = searchParams.get('audience') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      isActive: true,
      deletedAt: null,
    }
    if (audience) where.audience = audience

    const [announcements, total] = await Promise.all([
      db.announcement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.announcement.count({ where }),
    ])

    return NextResponse.json({
      announcements,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List announcements error:', error)
    return internalError('listing announcements')
  }
}

// POST /api/school/announcements - Create announcement
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'announcement:create')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to create announcements.")
    }

    const body = await request.json()
    const { title, content, audience, priority } = body

    if (!title || !content) {
      return apiError(400, 'Please enter both a title and the announcement content.')
    }

    const announcement = await db.announcement.create({
      data: {
        schoolId: user.schoolId,
        title,
        content,
        audience: audience || 'all',
        priority: priority || 'normal',
      },
    })

    return NextResponse.json(announcement, { status: 201 })
  } catch (error) {
    console.error('Create announcement error:', error)
    return internalError('creating the announcement')
  }
}
