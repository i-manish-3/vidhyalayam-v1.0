import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'

interface BulkFields {
  totalMarks?: number
  passingMarks?: number
  graceMarksMax?: number
  gradeOnly?: boolean
  isOptional?: boolean
  isAdditional?: boolean
}

// POST /api/school/exams/[id]/subject-configs/bulk
// Body: { configIds: string[], fields: BulkFields }
// Only the keys present in `fields` are applied to each config. Every config is
// validated independently (same rules as the single-config PATCH); failures are
// skipped and reported per config instead of aborting the whole request.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:configure')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to configure exams.")
    }
    const { id } = await params

    const exam = await db.exam.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, lockedAt: true },
    })
    if (!exam) return notFoundError('Exam')
    if (exam.lockedAt) {
      return apiError(423, 'This exam is locked. Unlock it before editing subject configs.')
    }

    const body = await request.json()
    if (!Array.isArray(body?.configIds) || body.configIds.length === 0) {
      return apiError(400, 'Please send at least one configId in the configIds array.')
    }
    if (!body.fields || typeof body.fields !== 'object') {
      return apiError(400, 'Please send a fields object.')
    }

    const f = body.fields as Record<string, unknown>
    const totalMarks = f.totalMarks !== undefined ? Number(f.totalMarks) : undefined
    const passingMarks = f.passingMarks !== undefined ? Number(f.passingMarks) : undefined
    const graceMarksMax = f.graceMarksMax !== undefined ? Number(f.graceMarksMax) : undefined
    const hasFields =
      totalMarks !== undefined ||
      passingMarks !== undefined ||
      graceMarksMax !== undefined ||
      f.gradeOnly !== undefined ||
      f.isOptional !== undefined ||
      f.isAdditional !== undefined
    if (!hasFields) return apiError(400, 'No fields to update.')

    if (totalMarks !== undefined && (!Number.isFinite(totalMarks) || totalMarks <= 0)) {
      return apiError(400, 'totalMarks must be positive.')
    }
    if (graceMarksMax !== undefined && (!Number.isFinite(graceMarksMax) || graceMarksMax < 0)) {
      return apiError(400, 'graceMarksMax must be non-negative.')
    }

    const configIds = body.configIds as string[]
    const configs = await db.examSubjectConfig.findMany({
      where: { id: { in: configIds }, examId: id, schoolId: user.schoolId, deletedAt: null },
      include: { components: true },
    })
    if (configs.length !== configIds.length) {
      return apiError(400, 'One or more of the subject configs could not be found.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const result = await db.$transaction(async (tx) => {
      let updated = 0
      let skipped = 0
      const errors: { configId: string; message: string }[] = []
      const auditEntries: Parameters<typeof logExamChangesBatch>[2][number][] = []

      for (const config of configs) {
        const data: Record<string, unknown> = {}
        const nextTotal = totalMarks !== undefined ? totalMarks : config.totalMarks

        if (totalMarks !== undefined) data.totalMarks = totalMarks
        if (passingMarks !== undefined) {
          if (!Number.isFinite(passingMarks) || passingMarks < 0 || passingMarks > nextTotal) {
            skipped += 1
            errors.push({
              configId: config.id,
              message: `Passing marks must be between 0 and ${nextTotal} for this config.`,
            })
            continue
          }
          data.passingMarks = passingMarks
        }
        if (graceMarksMax !== undefined) data.graceMarksMax = graceMarksMax
        if (f.gradeOnly !== undefined) data.gradeOnly = Boolean(f.gradeOnly)
        if (f.isOptional !== undefined) data.isOptional = Boolean(f.isOptional)
        if (f.isAdditional !== undefined) data.isAdditional = Boolean(f.isAdditional)

        // If totalMarks changes, the component sum must still match it (or be empty).
        if (data.totalMarks !== undefined && config.components.length > 0) {
          const sum = config.components.reduce((s, c) => s + c.maxMarks, 0)
          if (Math.abs(sum - nextTotal) > 0.0001) {
            skipped += 1
            errors.push({
              configId: config.id,
              message: `Component max marks (${sum}) must equal totalMarks (${nextTotal}). Update the components first.`,
            })
            continue
          }
        }

        const oldValue = { ...config, components: undefined }
        const updatedConfig = await tx.examSubjectConfig.update({
          where: { id: config.id },
          data,
        })
        updated += 1
        auditEntries.push({
          entityType: 'ExamSubjectConfig',
          entityId: config.id,
          action: 'updated',
          oldValue,
          newValue: updatedConfig,
          examId: id,
        })
      }

      if (auditEntries.length) {
        await logExamChangesBatch(tx, schoolId, auditEntries, { ...auditCtx, examId: id })
      }

      return { updated, skipped, errors }
    })

    return NextResponse.json({
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      message: `Updated ${result.updated} subject config(s). Skipped ${result.skipped}.`,
    })
  } catch (error) {
    console.error('Bulk update subject configs error:', error)
    return internalError('updating subject configs')
  }
}