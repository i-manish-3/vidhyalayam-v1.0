import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

interface ComponentInput {
  id?: string
  name: string
  shortCode?: string | null
  sequence?: number
  maxMarks: number
  gradeOnly?: boolean
}

function validateComponent(c: unknown): { ok: true; v: ComponentInput } | { ok: false; error: string } {
  if (!c || typeof c !== 'object') return { ok: false, error: 'Each component must be an object.' }
  const o = c as Record<string, unknown>
  if (typeof o.name !== 'string' || !o.name.trim()) return { ok: false, error: 'Each component needs a name.' }
  const maxMarks = Number(o.maxMarks)
  if (!Number.isFinite(maxMarks) || maxMarks < 0) {
    return { ok: false, error: 'maxMarks must be a non-negative number.' }
  }
  const sequence = o.sequence === undefined ? 0 : Math.trunc(Number(o.sequence))
  if (!Number.isFinite(sequence) || sequence < 0) return { ok: false, error: 'sequence must be a non-negative integer.' }

  return {
    ok: true,
    v: {
      id: typeof o.id === 'string' ? o.id : undefined,
      name: (o.name as string).trim(),
      shortCode: o.shortCode === undefined || o.shortCode === null || o.shortCode === ''
        ? null
        : String(o.shortCode).trim(),
      sequence,
      maxMarks,
      gradeOnly: Boolean(o.gradeOnly),
    },
  }
}

// POST /api/school/exams/subject-configs/[id]/components
// Body: { components: ComponentInput[] }
// Wholesale replace strategy: delete any existing components not present in the
// payload, update those whose id is supplied, insert the rest. Validates that
// sum(maxMarks) equals subjectConfig.totalMarks (unless config is gradeOnly).
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

    const config = await db.examSubjectConfig.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: { exam: { select: { lockedAt: true } }, components: true },
    })
    if (!config) return notFoundError('ExamSubjectConfig')
    if (config.exam.lockedAt) {
      return apiError(423, 'This exam is locked. Unlock it before changing components.')
    }

    const body = await request.json()
    if (!Array.isArray(body?.components)) {
      return apiError(400, 'Please send the components array.')
    }

    const validated: ComponentInput[] = []
    const seenNames = new Set<string>()
    for (const raw of body.components) {
      const v = validateComponent(raw)
      if (!v.ok) return apiError(400, v.error)
      const key = v.v.name.toLowerCase()
      if (seenNames.has(key)) return apiError(400, `Duplicate component name "${v.v.name}".`)
      seenNames.add(key)
      validated.push(v.v)
    }

    const sumMax = validated.reduce((s, c) => s + c.maxMarks, 0)

    if (config.gradeOnly) {
      // Grade-only configs may still have components if they're grade-only
      // channels; we only require that no numeric maxMarks is being introduced.
      const numericCount = validated.filter((c) => !c.gradeOnly && c.maxMarks > 0).length
      if (numericCount > 0) {
        return apiError(409, 'Grade-only subject configs cannot have numeric components.')
      }
    } else if (validated.length > 0 && Math.abs(sumMax - config.totalMarks) > 0.0001) {
      return apiError(
        409,
        `Component max marks (${sumMax}) must equal totalMarks (${config.totalMarks}).`,
      )
    }

    // Reject removing/editing components that already have marks against them.
    const idsInPayload = new Set(validated.map((c) => c.id).filter((x): x is string => Boolean(x)))
    const removed = config.components.filter((c) => !idsInPayload.has(c.id))
    if (removed.length > 0) {
      const usedCount = await db.marksEntry.count({
        where: { componentId: { in: removed.map((r) => r.id) }, deletedAt: null },
      })
      if (usedCount > 0) {
        return apiError(409, 'One or more components already have marks entered. Clear those marks first.')
      }
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const components = await db.$transaction(async (tx) => {
      // Delete components no longer in the payload.
      if (removed.length > 0) {
        await tx.examComponent.deleteMany({
          where: { id: { in: removed.map((r) => r.id) } },
        })
      }

      type ComponentEntity = Awaited<ReturnType<typeof tx.examComponent.create>>
      const results: ComponentEntity[] = []
      for (const c of validated) {
        if (c.id) {
          const updated = await tx.examComponent.update({
            where: { id: c.id },
            data: {
              name: c.name,
              shortCode: c.shortCode ?? null,
              sequence: c.sequence ?? 0,
              maxMarks: c.maxMarks,
              gradeOnly: Boolean(c.gradeOnly),
            },
          })
          results.push(updated)
        } else {
          const created = await tx.examComponent.create({
            data: {
              subjectConfigId: id,
              name: c.name,
              shortCode: c.shortCode ?? null,
              sequence: c.sequence ?? 0,
              maxMarks: c.maxMarks,
              gradeOnly: Boolean(c.gradeOnly),
            },
          })
          results.push(created)
        }
      }

      await logExamChange(
        tx,
        schoolId,
        'ExamComponent',
        id,
        'updated',
        { components: config.components },
        { components: results },
        { ...auditCtx, examId: config.examId, metadata: { subjectConfigId: id } },
      )

      return results
    })

    return NextResponse.json({ components, message: 'Components saved.' })
  } catch (error) {
    console.error('Save components error:', error)
    return internalError('saving exam components')
  }
}
