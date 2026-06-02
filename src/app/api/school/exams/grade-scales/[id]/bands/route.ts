import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

interface BandInput {
  code: string
  minValue: number
  maxValue: number
  gradePoint?: number | null
  remark?: string | null
  sequence?: number
}

function validateBand(c: unknown): { ok: true; v: BandInput } | { ok: false; error: string } {
  if (!c || typeof c !== 'object') return { ok: false, error: 'Each band must be an object.' }
  const o = c as Record<string, unknown>
  const code = typeof o.code === 'string' ? o.code.trim() : ''
  if (!code) return { ok: false, error: 'Each band needs a code (e.g. "A1", "B+").' }
  const minValue = Number(o.minValue)
  const maxValue = Number(o.maxValue)
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { ok: false, error: `Band "${code}" must have numeric min and max values.` }
  }
  if (maxValue < minValue) {
    return { ok: false, error: `Band "${code}" max must be >= min.` }
  }
  const gradePoint = o.gradePoint === undefined || o.gradePoint === null ? null : Number(o.gradePoint)
  if (gradePoint !== null && !Number.isFinite(gradePoint)) {
    return { ok: false, error: `Band "${code}" gradePoint must be numeric.` }
  }
  const sequence = o.sequence === undefined ? 0 : Math.trunc(Number(o.sequence))
  if (!Number.isFinite(sequence) || sequence < 0) {
    return { ok: false, error: `Band "${code}" sequence must be a non-negative integer.` }
  }
  return {
    ok: true,
    v: {
      code,
      minValue,
      maxValue,
      gradePoint,
      remark: o.remark === undefined || o.remark === null ? null : String(o.remark),
      sequence,
    },
  }
}

// POST /api/school/exams/grade-scales/[id]/bands - replace all bands
// Body: { bands: BandInput[] }
// Validates ranges, contiguity, and uniqueness of codes.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:gradescale:manage')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to manage grade bands.")
    }
    const { id } = await params

    const scale = await db.gradeScale.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: { bands: true },
    })
    if (!scale) return notFoundError('GradeScale')

    const body = await request.json()
    if (!Array.isArray(body?.bands)) {
      return apiError(400, 'Please send a bands array.')
    }

    const validated: BandInput[] = []
    const seenCodes = new Set<string>()
    for (const raw of body.bands) {
      const v = validateBand(raw)
      if (!v.ok) return apiError(400, v.error)
      const codeKey = v.v.code.toLowerCase()
      if (seenCodes.has(codeKey)) {
        return apiError(400, `Duplicate band code "${v.v.code}".`)
      }
      seenCodes.add(codeKey)
      validated.push(v.v)
    }

    // Sort by minValue so we can check for range overlaps deterministically.
    const sorted = [...validated].sort((a, b) => a.minValue - b.minValue)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].minValue < sorted[i - 1].maxValue) {
        return apiError(
          409,
          `Bands "${sorted[i - 1].code}" and "${sorted[i].code}" overlap. Adjust their ranges.`,
        )
      }
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const bands = await db.$transaction(async (tx) => {
      await tx.gradeBand.deleteMany({ where: { gradeScaleId: id } })
      if (validated.length > 0) {
        await tx.gradeBand.createMany({
          data: validated.map((b) => ({
            gradeScaleId: id,
            code: b.code,
            minValue: b.minValue,
            maxValue: b.maxValue,
            gradePoint: b.gradePoint ?? null,
            remark: b.remark ?? null,
            sequence: b.sequence ?? 0,
          })),
        })
      }
      const saved = await tx.gradeBand.findMany({
        where: { gradeScaleId: id },
        orderBy: { sequence: 'asc' },
      })
      await logExamChange(
        tx,
        schoolId,
        'GradeBand',
        id,
        'updated',
        { bands: scale.bands },
        { bands: saved },
        { ...auditCtx, metadata: { gradeScaleId: id, count: saved.length } },
      )
      return saved
    })

    return NextResponse.json({ bands, message: `Saved ${bands.length} band(s).` })
  } catch (error) {
    console.error('Save grade bands error:', error)
    return internalError('saving the grade bands')
  }
}
