import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'
import { isQueueEnabled, enqueueTenantExport } from '@/lib/queue'
import { processExportJob } from '@/lib/process-export-job'

interface ExportJobRow {
  id: string
  schoolId: string
  status: string
  format: string
  fileSize: number | null
  tableCount: number | null
  recordCount: number | null
  error: string | null
  requestedBy: string | null
  startedAt: Date | null
  completedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
  school?: { id: string; name: string } | null
}

function serialize(j: ExportJobRow): Record<string, unknown> {
  return {
    id: j.id,
    schoolId: j.schoolId,
    schoolName: j.school?.name ?? null,
    status: j.status,
    format: j.format,
    fileSize: j.fileSize,
    tableCount: j.tableCount,
    recordCount: j.recordCount,
    error: j.error,
    requestedBy: j.requestedBy,
    startedAt: j.startedAt,
    completedAt: j.completedAt,
    expiresAt: j.expiresAt,
    createdAt: j.createdAt,
  }
}

// GET /api/super-admin/exports — list recent export jobs.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const { searchParams } = new URL(request.url)
    const schoolId = searchParams.get('schoolId')

    const jobs = await db.exportJob.findMany({
      where: schoolId ? { schoolId } : {},
      include: { school: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ jobs: jobs.map(serialize) })
  } catch (error) {
    console.error('List export jobs error:', error)
    return internalError('loading export jobs')
  }
}

// POST /api/super-admin/exports — request an export for a school.
// Body: { schoolId: string }
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const body = await request.json()
    const schoolId = typeof body.schoolId === 'string' ? body.schoolId : ''
    if (!schoolId) return apiError(400, 'Please select a school to export.')

    const school = await db.school.findFirst({
      where: { id: schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!school) return notFoundError('School')

    // Refuse to pile up: one in-flight export per school at a time.
    const inFlight = await db.exportJob.findFirst({
      where: { schoolId, status: { in: ['pending', 'processing'] } },
      select: { id: true },
    })
    if (inFlight) {
      return apiError(409, 'An export for this school is already in progress. Please wait for it to finish.')
    }

    const job = await db.exportJob.create({
      data: { schoolId, status: 'pending', requestedBy: user.userId },
      include: { school: { select: { id: true, name: true } } },
    })

    if (isQueueEnabled()) {
      await enqueueTenantExport({ jobId: job.id, schoolId, requestedBy: user.userId })
    } else {
      // No queue configured — run inline. Don't await (response shouldn't block on
      // a potentially long dump); the row reflects progress via its status.
      void processExportJob(job.id)
    }

    return NextResponse.json(serialize(job), { status: 201 })
  } catch (error) {
    console.error('Create export job error:', error)
    return internalError('starting the export')
  }
}
