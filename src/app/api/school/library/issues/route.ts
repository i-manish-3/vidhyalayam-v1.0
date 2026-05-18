import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/library/issues - List book issues
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
    }
    if (status) where.status = status

    const [issues, total] = await Promise.all([
      db.bookIssue.findMany({
        where,
        include: {
          book: {
            select: { id: true, title: true, author: true, isbn: true },
          },
        },
        orderBy: { issueDate: 'desc' },
        skip,
        take: limit,
      }),
      db.bookIssue.count({ where }),
    ])

    return NextResponse.json({
      issues,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List book issues error:', error)
    return internalError('listing book issues')
  }
}

// POST /api/school/library/issues - Issue book
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { bookId, studentId, teacherId, dueDate } = body

    if (!bookId) {
      return apiError(400, 'Please select a book to issue.')
    }

    if (!studentId && !teacherId) {
      return apiError(400, 'Please select a student or teacher who is borrowing this book.')
    }

    // Verify book belongs to this school and is available
    const book = await db.libraryBook.findFirst({
      where: { id: bookId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!book) {
      return notFoundError('Book')
    }

    if (book.available <= 0) {
      return apiError(400, 'All copies of this book are currently issued to others. Please check back later or choose a different book.')
    }

    // Create issue and update available count
    const [issue] = await db.$transaction([
      db.bookIssue.create({
        data: {
          schoolId: user.schoolId,
          bookId,
          studentId: studentId || null,
          teacherId: teacherId || null,
          issueDate: new Date(),
          dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // Default 14 days
          status: 'issued',
        },
      }),
      db.libraryBook.update({
        where: { id: bookId },
        data: { available: { decrement: 1 } },
      }),
    ])

    return NextResponse.json(issue, { status: 201 })
  } catch (error) {
    console.error('Issue book error:', error)
    return internalError('issuing the book')
  }
}
