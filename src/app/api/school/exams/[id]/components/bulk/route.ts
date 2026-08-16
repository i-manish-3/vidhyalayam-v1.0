import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'

interface ComponentInput {
  id?: string
  name: string
  shortCode?: string | null
  sequence?: number
  maxMarks: number
  passingMarks?: number
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
  const passingMarks = o.passingMarks === undefined ? 0 : Number(o.passingMarks)
  if (!Number.isFinite(passingMarks) || passingMarks < 0 || passingMarks > maxMarks) {
    return { ok: false, error: 'passingMarks must be between 0 and maxMarks.' }
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
      passingMarks,
      gradeOnly: Boolean(o.gradeOnly),
    },
  }
}

interface ConfigComponentsInput {
  configId: string
  components: ComponentInput[]
}

// POST /api/school/exams/[id]/components/bulk
// Body: { configs: ConfigComponentsInput[] }
// Applies the same component split to many subject configs at once. Each config
// is validated independently (sum must equal totalMarks, no numeric components
// on grade-only configs) and updated wholesale; failures are reported per
// config instead of aborting the whole request.
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
    if (!Array.isArray(body?.configs) || body.configs.length === 0) {
      return apiError(400, 'Please send at least one config in the configs array.')
    }

    const entries: ConfigComponentsInput[] = []
    for (const raw of body.configs) {
      if (!raw || typeof raw !== 'object') return apiError(400, 'Each config entry must be an object.')
      const o = raw as Record<string, unknown>
      if (typeof o.configId !== 'string' || !o.configId) {
        return apiError(400, 'Each config entry needs a configId.')
      }
      if (!Array.isArray(o.components) || o.components.length === 0) {
        return apiError(400, `Config ${o.configId} needs a non-empty components array.`)
      }
      const validated: ComponentInput[] = []
      const seenNames = new Set<string>()
      for (const comp of o.components) {
        const v = validateComponent(comp)
        if (!v.ok) return apiError(400, v.error)
        const key = v.v.name.toLowerCase()
        if (seenNames.has(key)) return apiError(400, `Duplicate component name "${v.v.name}".`)
        seenNames.add(key)
        validated.push(v.v)
      }
      entries.push({ configId: o.configId, components: validated })
    }

    const configIds = entries.map((e) => e.configId)
    const configs = await db.examSubjectConfig.findMany({
      where: { id: { in: configIds }, examId: id, schoolId: user.schoolId, deletedAt: null },
      include: { components: true },
    })
    if (configs.length !== configIds.length) {
      return apiError(400, 'One or more of the subject configs could not be found.')
    }

    const configById = new Map(configs.map((c) => [c.id, c]))
    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const result = await db.$transaction(async (tx) => {
      let updated = 0
      let skipped = 0
      const errors: { configId: string; message: string }[] = []
      const auditEntries: Parameters<typeof logExamChangesBatch>[2][number][] = []

      for (const entry of entries) {
        const config = configById.get(entry.configId)!
        const components = entry.components

        const numericCount = components.filter((c) => !c.gradeOnly && c.maxMarks > 0).length
        if (config.gradeOnly) {
          if (numericCount > 0) {
            skipped += 1
            errors.push({ configId: config.id, message: 'Grade-only subject — numeric components not allowed.' })
            continue
          }
        } else if (Math.abs(components.reduce((s, c) => s + c.maxMarks, 0) - config.totalMarks) > 0.0001) {
          skipped += 1
          errors.push({
            configId: config.id,
            message: `Components must sum to ${config.totalMarks} marks (this config).`,
          })
          continue
        }

        const idsInPayload = new Set(components.map((c) => c.id).filter((x): x is string => Boolean(x)))
        const removed = config.components.filter((c) => !idsInPayload.has(c.id))
        if (removed.length > 0) {
          const usedCount = await tx.marksEntry.count({
            where: { componentId: { in: removed.map((r) => r.id) }, deletedAt: null },
          })
          if (usedCount > 0) {
            skipped += 1
            errors.push({ configId: config.id, message: 'Existing components already have marks entered.' })
            continue
          }
          await tx.examComponent.deleteMany({
            where: { id: { in: removed.map((r) => r.id) } },
          })
        }

        const results = []
        for (const c of components) {
          if (c.id) {
            results.push(
              await tx.examComponent.update({
                where: { id: c.id },
                data: {
                  name: c.name,
                  shortCode: c.shortCode ?? null,
                  sequence: c.sequence ?? 0,
                  maxMarks: c.maxMarks,
                  passingMarks: c.passingMarks ?? 0,
                  gradeOnly: Boolean(c.gradeOnly),
                },
              }),
            )
          } else {
            results.push(
              await tx.examComponent.create({
                data: {
                  subjectConfigId: config.id,
                  name: c.name,
                  shortCode: c.shortCode ?? null,
                  sequence: c.sequence ?? 0,
                  maxMarks: c.maxMarks,
                  passingMarks: c.passingMarks ?? 0,
                  gradeOnly: Boolean(c.gradeOnly),
                },
              }),
            )
          }
        }

        updated += 1
        auditEntries.push({
          entityType: 'ExamComponent',
          entityId: config.id,
          action: 'updated',
          oldValue: { components: config.components },
          newValue: { components: results },
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
      message: `Updated components for ${result.updated} subject(s). Skipped ${result.skipped}.`,
    })
  } catch (error) {
    console.error('Bulk save components error:', error)
    return internalError('saving exam components')
  }
}