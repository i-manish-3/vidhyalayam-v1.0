import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'

// POST /api/school/exams/[id]/components/bulk-delete
// Body: { configIds: string[], componentName: string }
// Deletes the named component from every selected subject config. Remaining
// numeric components are redistributed proportionally so maxMarks still sum to
// each subject's totalMarks (grade-only components stay untouched). Configs
// where the name doesn't exist, or where marks are already entered, are skipped
// and reported instead of aborting the whole request.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:configure')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to configure exam components.")
    }
    const { id } = await params

    const exam = await db.exam.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, lockedAt: true },
    })
    if (!exam) return notFoundError('Exam')
    if (exam.lockedAt) {
      return apiError(423, 'This exam is locked. Unlock it before changing components.')
    }

    const body = await request.json()
    if (!Array.isArray(body?.configIds) || body.configIds.length === 0) {
      return apiError(400, 'Please send at least one configId in the configIds array.')
    }
    if (typeof body?.componentName !== 'string' || !body.componentName.trim()) {
      return apiError(400, 'Please send a componentName to delete.')
    }
    const componentName = body.componentName.trim()

    const configIds = body.configIds as string[]
    const configs = await db.examSubjectConfig.findMany({
      where: { id: { in: configIds }, examId: id, schoolId: user.schoolId, deletedAt: null },
      include: { components: { orderBy: { sequence: 'asc' } } },
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
        const nameKey = componentName.toLowerCase()
        const matches = config.components.filter((c) => c.name.toLowerCase() === nameKey)
        if (matches.length === 0) {
          skipped += 1
          errors.push({ configId: config.id, message: `No component named "${componentName}" in this subject.` })
          continue
        }

        const usedCount = await tx.marksEntry.count({
          where: { componentId: { in: matches.map((m) => m.id) }, deletedAt: null },
        })
        if (usedCount > 0) {
          skipped += 1
          errors.push({ configId: config.id, message: `"${componentName}" already has marks entered in this subject.` })
          continue
        }

        const matchIds = new Set(matches.map((m) => m.id))
        const remaining = config.components.filter((c) => !matchIds.has(c.id))
        const remainingNumeric = remaining.filter((c) => !c.gradeOnly)

        await tx.examComponent.deleteMany({ where: { id: { in: Array.from(matchIds) } } })

        // Redistribute remaining numeric components so the sum still matches
        // totalMarks (proportional, last row absorbs rounding).
        if (!config.gradeOnly && remainingNumeric.length > 0) {
          const sumMax = remainingNumeric.reduce((s, c) => s + c.maxMarks, 0)
          const lastNumeric = remainingNumeric[remainingNumeric.length - 1]
          let used = 0
          for (const c of remaining) {
            const i = c.sequence
            if (c.gradeOnly) continue
            const share = sumMax > 0 ? c.maxMarks / sumMax : 1 / remainingNumeric.length
            const max = c === lastNumeric ? Math.max(0, config.totalMarks - used) : Math.round(config.totalMarks * share)
            used += max
            const pass =
              c.passingMarks > 0 && c.maxMarks > 0
                ? Math.round((c.passingMarks / c.maxMarks) * max)
                : 0
            await tx.examComponent.update({
              where: { id: c.id },
              data: { sequence: i, maxMarks: max, passingMarks: pass },
            })
          }
        }

        updated += 1
        auditEntries.push({
          entityType: 'ExamComponent',
          entityId: config.id,
          action: 'updated',
          oldValue: { components: config.components },
          newValue: { deleted: matches, remaining },
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
      message: `Deleted "${componentName}" from ${result.updated} subject(s). Skipped ${result.skipped}.`,
    })
  } catch (error) {
    console.error('Bulk delete components error:', error)
    return internalError('deleting exam components')
  }
}