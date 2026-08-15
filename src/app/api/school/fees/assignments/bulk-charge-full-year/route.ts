import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, forbiddenError, internalError, unauthorizedError } from '@/lib/api-errors'
import { FullYearRecomputeError, recomputeFullYearForAssignment } from '@/lib/fees-full-year'

const MAX_STUDENTS_PER_REQUEST = 100

type BulkResult = {
  converted: Array<{ assignmentId: string; studentId: string; studentName: string }>
  skipped: Array<{ assignmentId: string; studentId: string; studentName: string; reason: string }>
  failed: Array<{ assignmentId: string; studentId: string; studentName: string; reason: string }>
}

// POST /api/school/fees/assignments/bulk-charge-full-year
// Recomputes several zero-paid, pro-rated fee assignments as full-year demands
// in one go. Each student runs in its own transaction (via the shared helper)
// so one bad row never aborts the batch. Already-billed or partially-paid
// students are reported as skipped, and structural failures as failed.
export async function POST(request: NextRequest) {
  try {
    // SUPER_ADMIN is intentionally excluded — same restriction as change-group.
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SCHOOL_ADMIN') {
      const authorized = await requirePermission(request, 'fees:change-group')
      if (!authorized) {
        return forbiddenError("You don't have permission to change fee billing. Contact your school administrator.")
      }
    }

    const schoolId = user.schoolId
    const body = await request.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    const assignmentIds: string[] = Array.isArray(body.assignmentIds)
      ? Array.from(
          new Set(body.assignmentIds.filter((id: unknown): id is string => typeof id === 'string' && !!id.trim())),
        )
      : []

    if (assignmentIds.length === 0) {
      return apiError(400, 'Please select at least one student.')
    }
    if (assignmentIds.length > MAX_STUDENTS_PER_REQUEST) {
      return apiError(400, `Please assign at most ${MAX_STUDENTS_PER_REQUEST} students per batch.`)
    }

    const result: BulkResult = { converted: [], skipped: [], failed: [] }

    for (const assignmentId of assignmentIds) {
      try {
        const converted = await recomputeFullYearForAssignment({
          assignmentId,
          schoolId,
          assignedBy: user.userId,
          reason,
        })
        result.converted.push({
          assignmentId: converted.assignmentId,
          studentId: converted.studentId,
          studentName: converted.studentName,
        })
      } catch (err) {
        if (err instanceof FullYearRecomputeError) {
          const entry = {
            assignmentId,
            studentId: err.student?.id || assignmentId,
            studentName: err.student?.name || '',
            reason: err.message,
          }
          if (err.code === 'not_found') {
            result.failed.push(entry)
          } else {
            result.skipped.push(entry)
          }
        } else {
          result.failed.push({
            assignmentId,
            studentId: assignmentId,
            studentName: '',
            reason: err instanceof Error ? err.message.slice(0, 200) : 'Unknown error',
          })
        }
      }
    }

    const message =
      `Billed ${result.converted.length} student${result.converted.length === 1 ? '' : 's'} for the full academic year.` +
      (result.skipped.length ? ` ${result.skipped.length} skipped.` : '') +
      (result.failed.length ? ` ${result.failed.length} failed.` : '')

    return NextResponse.json({ ...result, message })
  } catch (error) {
    console.error('Bulk charge full year error:', error)
    return internalError('recomputing full-year fee demands')
  }
}