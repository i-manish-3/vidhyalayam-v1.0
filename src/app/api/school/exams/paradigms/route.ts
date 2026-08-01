import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

// Allowed top-level aggregation rule shapes. Stored as JSON strings; we validate
// the shape on write so the calculation engine in Phase 4 can trust the payload.
const VALID_AGG_TYPES = ['weighted', 'best_of_n', 'sum_all']

function parseRule(value: unknown, fieldLabel: string): { ok: true; json: string } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: false, error: `Please provide the ${fieldLabel}.` }
  }
  // Accept both raw object and pre-stringified JSON.
  let obj: unknown = value
  if (typeof value === 'string') {
    try {
      obj = JSON.parse(value)
    } catch {
      return { ok: false, error: `The ${fieldLabel} isn't valid JSON. Please review and try again.` }
    }
  }
  if (typeof obj !== 'object' || obj === null) {
    return { ok: false, error: `The ${fieldLabel} must be a JSON object.` }
  }
  return { ok: true, json: JSON.stringify(obj) }
}

function validateAggregationRule(value: unknown): { ok: true; json: string } | { ok: false; error: string } {
  const parsed = parseRule(value, 'aggregation rule')
  if (!parsed.ok) return parsed
  const obj = JSON.parse(parsed.json) as Record<string, unknown>
  const type = obj.type
  if (typeof type !== 'string' || !VALID_AGG_TYPES.includes(type)) {
    return { ok: false, error: `Aggregation type must be one of: ${VALID_AGG_TYPES.join(', ')}.` }
  }
  return parsed
}

function validatePassingRule(value: unknown): { ok: true; json: string } | { ok: false; error: string } {
  const parsed = parseRule(value, 'passing rule')
  if (!parsed.ok) return parsed
  const obj = JSON.parse(parsed.json) as Record<string, unknown>
  const perSubject = obj.perSubject
  const overall = obj.overall
  if (typeof perSubject !== 'number' || perSubject < 0 || perSubject > 100) {
    return { ok: false, error: 'Per-subject passing percentage must be between 0 and 100.' }
  }
  if (typeof overall !== 'number' || overall < 0 || overall > 100) {
    return { ok: false, error: 'Overall passing percentage must be between 0 and 100.' }
  }
  return parsed
}

// GET /api/school/exams/paradigms - List exam paradigms for the school
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const permitted = await requirePermission(request, 'exam:view')
    if (!permitted) {
      return forbiddenError()
    }

    const { searchParams } = new URL(request.url)
    const academicYear = searchParams.get('academicYear') ?? undefined
    const isActive = searchParams.get('isActive')

    const paradigms = await db.examParadigm.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(academicYear ? { academicYear } : {}),
        ...(isActive === 'true' ? { isActive: true } : isActive === 'false' ? { isActive: false } : {}),
      },
      include: {
        _count: { select: { examGroups: true } },
      },
      orderBy: [{ academicYear: 'desc' }, { name: 'asc' }],
    })

    return NextResponse.json({ paradigms })
  } catch (error) {
    console.error('List exam paradigms error:', error)
    return internalError('loading exam paradigms')
  }
}

// POST /api/school/exams/paradigms - Create a new exam paradigm
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'exam:create')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to create exam paradigms.")
    }

    const body = await request.json()
    const {
      academicYear,
      name,
      description,
      aggregationRule,
      passingRule,
      isActive,
      isDefault,
    } = body

    if (!academicYear || typeof academicYear !== 'string') {
      return apiError(400, 'Please choose an academic year for this paradigm.')
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return apiError(400, 'Please enter a name for the paradigm.')
    }
    const trimmedName = name.trim()

    const agg = validateAggregationRule(aggregationRule)
    if (!agg.ok) return apiError(400, agg.error)
    const passing = validatePassingRule(passingRule)
    if (!passing.ok) return apiError(400, passing.error)

    const duplicate = await db.examParadigm.findFirst({
      where: { schoolId: user.schoolId, academicYear, name: trimmedName, deletedAt: null },
    })
    if (duplicate) {
      return apiError(409, `A paradigm named "${trimmedName}" already exists for ${academicYear}.`)
    }

    const schoolId = user.schoolId
    const auditCtx = { ...extractExamAuditContext(request, user.userId), }

    const paradigm = await db.$transaction(async (tx) => {
      // If marking as default, clear the prior default for the same AY first.
      if (isDefault) {
        await tx.examParadigm.updateMany({
          where: { schoolId, academicYear, isDefault: true, deletedAt: null },
          data: { isDefault: false },
        })
      }

      const created = await tx.examParadigm.create({
        data: {
          schoolId,
          academicYear,
          name: trimmedName,
          description: description ? String(description).trim() : null,
          aggregationRule: agg.json,
          passingRule: passing.json,
          isActive: isActive === undefined ? true : Boolean(isActive),
          isDefault: Boolean(isDefault),
        },
      })

      await logExamChange(tx, schoolId, 'ExamParadigm', created.id, 'created', null, created, auditCtx)
      return created
    })

    return NextResponse.json({ paradigm }, { status: 201 })
  } catch (error) {
    console.error('Create exam paradigm error:', error)
    return internalError('creating the exam paradigm')
  }
}
