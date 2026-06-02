import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

const VALID_AGG_TYPES = ['weighted', 'best_of_n', 'sum_all']

function validateGroupAggRule(value: unknown):
  | { ok: true; json: string | null }
  | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') {
    // null = "sum_all" implicit default at group level (per schema comment).
    return { ok: true, json: null }
  }
  let obj: unknown = value
  if (typeof value === 'string') {
    try {
      obj = JSON.parse(value)
    } catch {
      return { ok: false, error: "The aggregation rule isn't valid JSON." }
    }
  }
  if (typeof obj !== 'object' || obj === null) {
    return { ok: false, error: 'The aggregation rule must be a JSON object.' }
  }
  const t = (obj as Record<string, unknown>).type
  if (typeof t !== 'string' || !VALID_AGG_TYPES.includes(t)) {
    return { ok: false, error: `Aggregation type must be one of: ${VALID_AGG_TYPES.join(', ')}.` }
  }
  return { ok: true, json: JSON.stringify(obj) }
}

// GET /api/school/exams/groups?paradigmId=... - List groups (optionally filtered)
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const paradigmId = searchParams.get('paradigmId') ?? undefined

    const groups = await db.examGroup.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(paradigmId ? { paradigmId } : {}),
      },
      include: {
        _count: { select: { exams: true } },
        paradigm: { select: { id: true, name: true, academicYear: true } },
      },
      orderBy: [{ paradigmId: 'asc' }, { sequence: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json({ groups })
  } catch (error) {
    console.error('List exam groups error:', error)
    return internalError('loading exam groups')
  }
}

// POST /api/school/exams/groups - Create a new group under a paradigm
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'exam:create')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to create exam groups.")
    }

    const body = await request.json()
    const { paradigmId, name, shortCode, sequence, weight, aggregationRule, isCoScholastic } = body

    if (!paradigmId || typeof paradigmId !== 'string') {
      return apiError(400, 'Please choose the paradigm this group belongs to.')
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return apiError(400, 'Please enter a name for the group.')
    }
    const trimmedName = name.trim()

    const paradigm = await db.examParadigm.findFirst({
      where: { id: paradigmId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!paradigm) {
      return apiError(404, "We couldn't find that paradigm. It may have been removed.")
    }

    const dup = await db.examGroup.findFirst({
      where: { schoolId: user.schoolId, paradigmId, name: trimmedName, deletedAt: null },
    })
    if (dup) {
      return apiError(409, `A group named "${trimmedName}" already exists under this paradigm.`)
    }

    const aggRule = validateGroupAggRule(aggregationRule)
    if (!aggRule.ok) return apiError(400, aggRule.error)

    const weightNum = weight === undefined ? 100 : Number(weight)
    if (!Number.isFinite(weightNum) || weightNum < 0 || weightNum > 100) {
      return apiError(400, 'Weight must be a number between 0 and 100.')
    }
    const sequenceNum = sequence === undefined ? 0 : Math.trunc(Number(sequence))
    if (!Number.isFinite(sequenceNum) || sequenceNum < 0) {
      return apiError(400, 'Sequence must be a non-negative number.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const group = await db.$transaction(async (tx) => {
      const created = await tx.examGroup.create({
        data: {
          schoolId,
          paradigmId,
          name: trimmedName,
          shortCode: shortCode ? String(shortCode).trim() : null,
          sequence: sequenceNum,
          weight: weightNum,
          aggregationRule: aggRule.json,
          isCoScholastic: Boolean(isCoScholastic),
        },
      })
      await logExamChange(tx, schoolId, 'ExamGroup', created.id, 'created', null, created, auditCtx)
      return created
    })

    return NextResponse.json({ group }, { status: 201 })
  } catch (error) {
    console.error('Create exam group error:', error)
    return internalError('creating the exam group')
  }
}
