import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER'])
    if (!user || !user.schoolId) return unauthorizedError()

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    const events = await db.schoolEvent.findMany({
      where: {
        schoolId: user.schoolId,
        startDate: { gte: startDate, lte: endDate },
      },
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        startDate: true,
        endDate: true,
        allDay: true,
        color: true,
      },
    })

    return NextResponse.json({ events })
  } catch (error) {
    console.error('[SCHOOL_EVENTS_GET]', error)
    return internalError('Failed to fetch events')
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) return unauthorizedError()

    const body = await request.json()
    const { title, description, startDate, endDate, allDay, color } = body

    if (!title || !startDate) {
      return NextResponse.json(
        { error: 'Title and start date are required' },
        { status: 400 }
      )
    }

    const event = await db.schoolEvent.create({
      data: {
        schoolId: user.schoolId,
        title,
        description,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        allDay: allDay ?? true,
        color: color || '#ec4899',
        createdBy: user.userId,
      },
    })

    return NextResponse.json({ event }, { status: 201 })
  } catch (error) {
    console.error('[SCHOOL_EVENTS_POST]', error)
    return internalError('Failed to create event')
  }
}
