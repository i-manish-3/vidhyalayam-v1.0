import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, forbiddenError } from '@/lib/api-errors'
import { getDemandSlipJobStatus } from '@/lib/queue'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()
    const permitted = await requirePermission(request, 'fees:read')
    if (!permitted) return forbiddenError()

    const { runId } = await params

    // Get run from database
    const run = await db.feeDemandRun.findFirst({
      where: {
        id: runId,
        schoolId: user.schoolId,
      },
      select: {
        id: true,
        billingMonth: true,
        billingYear: true,
        triggerType: true,
        status: true,
        totalStudents: true,
        successCount: true,
        skippedCount: true,
        failedCount: true,
        startedAt: true,
        completedAt: true,
        errorLog: true,
      },
    })

    if (!run) return notFoundError('Demand run not found')

    // Parse errorLog to extract errors and skipped details
    let errors: Array<{ studentId: string; error: string }> = []
    let skipped: Array<{ studentId: string; reason: string }> = []

    if (run.errorLog) {
      try {
        const parsed = JSON.parse(run.errorLog)
        // New format: { errors: [...], skipped: [...] }
        if (parsed.errors && Array.isArray(parsed.errors)) {
          errors = parsed.errors
        }
        if (parsed.skipped && Array.isArray(parsed.skipped)) {
          skipped = parsed.skipped
        }
        // Old format: just an array of errors
        if (Array.isArray(parsed) && parsed.length > 0 && !parsed.errors) {
          errors = parsed
        }
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Get job status from queue (if still in queue)
    let jobStatus = null
    try {
      jobStatus = await getDemandSlipJobStatus(runId)
    } catch (error) {
      // Queue might not be available or job might be too old
      console.warn('Could not fetch job status from queue:', error)
    }

    // Combine database and queue status
    const response = {
      run,
      job: jobStatus,
      errors,
      skipped,
      // Calculate progress percentage
      progress: run.totalStudents > 0
        ? Math.round(((run.successCount + run.skippedCount + run.failedCount) / run.totalStudents) * 100)
        : 0,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Get demand run status error:', error)
    return internalError('fetching demand run status')
  }
}
