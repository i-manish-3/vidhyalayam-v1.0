import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError } from '@/lib/api-errors'
import { deleteExportArtifact } from '@/lib/tenant-export'

// GET /api/super-admin/exports/[id] — single job status.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const { id } = await params
    const job = await db.exportJob.findUnique({
      where: { id },
      include: { school: { select: { id: true, name: true } } },
    })
    if (!job) return notFoundError('Export')

    return NextResponse.json({
      id: job.id,
      schoolId: job.schoolId,
      schoolName: job.school?.name ?? null,
      status: job.status,
      format: job.format,
      fileSize: job.fileSize,
      tableCount: job.tableCount,
      recordCount: job.recordCount,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
      createdAt: job.createdAt,
    })
  } catch (error) {
    console.error('Get export job error:', error)
    return internalError('loading the export job')
  }
}

// DELETE /api/super-admin/exports/[id] — remove a job + its artifact.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const { id } = await params
    const job = await db.exportJob.findUnique({ where: { id } })
    if (!job) return notFoundError('Export')

    await deleteExportArtifact(job.filePath)
    await db.exportJob.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete export job error:', error)
    return internalError('deleting the export job')
  }
}
