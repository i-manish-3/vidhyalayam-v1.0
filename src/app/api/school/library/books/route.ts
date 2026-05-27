import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/library/books - List books
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { author: { contains: search } },
        { isbn: { contains: search } },
        { publisher: { contains: search } },
      ]
    }
    if (category) where.category = category

    const [books, total] = await Promise.all([
      db.libraryBook.findMany({
        where,
        orderBy: { title: 'asc' },
        skip,
        take: limit,
      }),
      db.libraryBook.count({ where }),
    ])

    return NextResponse.json({
      books,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List books error:', error)
    return internalError('listing books')
  }
}

// POST /api/school/library/books - Add book
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'library:create')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to add library books.")
    }

    const body = await request.json()
    const {
      title,
      author,
      isbn,
      publisher,
      category,
      edition,
      quantity,
      shelfNumber,
      price,
    } = body

    if (!title) {
      return apiError(400, 'Please enter the book title.')
    }

    const bookQuantity = quantity || 1
    const book = await db.libraryBook.create({
      data: {
        schoolId: user.schoolId,
        title,
        author,
        isbn,
        publisher,
        category,
        edition,
        quantity: bookQuantity,
        available: bookQuantity,
        shelfNumber,
        price,
      },
    })

    return NextResponse.json(book, { status: 201 })
  } catch (error) {
    console.error('Add book error:', error)
    return internalError('adding the book')
  }
}
