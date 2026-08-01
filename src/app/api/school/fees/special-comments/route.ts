import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError, forbiddenError } from '@/lib/api-errors'

const ENTITY_TYPE = 'StudentFeeSpecialComment'
const ACTION = 'special_comment_added'

function parseComment(value: string | null) {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return typeof parsed?.comment === 'string' ? parsed.comment : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()
    const permitted = await requirePermission(request, 'fees:read')
    if (!permitted) return forbiddenError()

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || ''
    if (!studentId) return apiError(400, 'Student is required.')

    const logs = await db.feeAuditLog.findMany({
      where: {
        schoolId: user.schoolId,
        studentId,
        entityType: ENTITY_TYPE,
        action: ACTION,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    })

    return NextResponse.json({
      comments: logs
        .map((log) => ({
          id: log.id,
          comment: parseComment(log.newValue) || log.diffSummary || '',
          createdAt: log.createdAt,
          createdBy: log.user ? { id: log.user.id, name: log.user.name || log.user.email || 'Unknown' } : null,
        }))
        .filter((comment) => comment.comment.trim().length > 0),
    })
  } catch (error) {
    console.error('List fee special comments error:', error)
    return internalError('listing fee special comments')
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'fees:collect')
    if (!user?.schoolId) return apiError(403, "You don't have permission to add fee comments.")

    const body = await request.json()
    const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : ''
    const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
    if (!studentId) return apiError(400, 'Student is required.')
    if (!comment) return apiError(400, 'Comment is required.')

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found.')

    const log = await db.feeAuditLog.create({
      data: {
        schoolId: user.schoolId,
        studentId,
        entityType: ENTITY_TYPE,
        entityId: studentId,
        action: ACTION,
        userId: user.userId,
        newValue: JSON.stringify({ comment }),
        diffSummary: comment,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    })

    return NextResponse.json({
      comment: {
        id: log.id,
        comment,
        createdAt: log.createdAt,
        createdBy: log.user ? { id: log.user.id, name: log.user.name || log.user.email || 'Unknown' } : null,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Add fee special comment error:', error)
    return internalError('adding fee special comment')
  }
}
