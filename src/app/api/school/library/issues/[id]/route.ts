import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// PATCH /api/school/library/issues/[id] - Return book
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'library:issue')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to manage book returns.")
    }

    const { id } = await params

    // Verify issue belongs to this school
    const issue = await db.bookIssue.findFirst({
      where: { id, schoolId: user.schoolId },
    })
    if (!issue) {
      return notFoundError('Book issue record')
    }

    if (issue.status === 'returned') {
      return apiError(400, 'This book has already been returned. No action needed.')
    }

    // Calculate fine if overdue
    let fine = 0
    const now = new Date()
    if (now > issue.dueDate) {
      const daysOverdue = Math.ceil(
        (now.getTime() - issue.dueDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      fine = daysOverdue * 5 // ₹5 per day
    }

    // Return book and update available count
    const [updated] = await db.$transaction([
      db.bookIssue.update({
        where: { id },
        data: {
          returnDate: now,
          status: 'returned',
          fine,
        },
      }),
      db.libraryBook.update({
        where: { id: issue.bookId },
        data: { available: { increment: 1 } },
      }),
    ])

    return NextResponse.json({
      ...updated,
      fine,
      message: fine > 0 ? `Book returned with overdue fine of ₹${fine}` : 'Book returned successfully',
    })
  } catch (error) {
    console.error('Return book error:', error)
    return internalError('returning the book')
  }
}
