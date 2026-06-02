import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

const VALID_SCALE_TYPES = ['percentage', 'marks', 'cgpa']

// GET /api/school/exams/grade-scales - list scales (with bands)
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const { searchParams } = new URL(request.url)
    const paradigmId = searchParams.get('paradigmId') ?? undefined
    const examGroupId = searchParams.get('examGroupId') ?? undefined
    const classId = searchParams.get('classId') ?? undefined

    const scales = await db.gradeScale.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(paradigmId ? { paradigmId } : {}),
        ...(examGroupId ? { examGroupId } : {}),
        ...(classId ? { classId } : {}),
      },
      include: { bands: { orderBy: { sequence: 'asc' } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })

    return NextResponse.json({ scales })
  } catch (error) {
    console.error('List grade scales error:', error)
    return internalError('loading grade scales')
  }
}

// POST /api/school/exams/grade-scales - create a grade scale (bands posted separately)
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'exam:gradescale:manage')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to manage grade scales.")
    }

    const body = await request.json()
    const { name, paradigmId, examGroupId, classId, scaleType, isActive, isDefault } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return apiError(400, 'Please enter a name for this grade scale.')
    }
    const trimmedName = name.trim()
    const resolvedScaleType = scaleType ?? 'percentage'
    if (!VALID_SCALE_TYPES.includes(resolvedScaleType)) {
      return apiError(400, `Scale type must be one of: ${VALID_SCALE_TYPES.join(', ')}.`)
    }

    const duplicate = await db.gradeScale.findFirst({
      where: { schoolId: user.schoolId, name: trimmedName, deletedAt: null },
    })
    if (duplicate) {
      return apiError(409, `A grade scale named "${trimmedName}" already exists.`)
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const scale = await db.$transaction(async (tx) => {
      if (isDefault) {
        await tx.gradeScale.updateMany({
          where: { schoolId, isDefault: true, deletedAt: null },
          data: { isDefault: false },
        })
      }
      const created = await tx.gradeScale.create({
        data: {
          schoolId,
          name: trimmedName,
          paradigmId: paradigmId ? String(paradigmId) : null,
          examGroupId: examGroupId ? String(examGroupId) : null,
          classId: classId ? String(classId) : null,
          scaleType: resolvedScaleType,
          isActive: isActive === undefined ? true : Boolean(isActive),
          isDefault: Boolean(isDefault),
        },
      })
      await logExamChange(tx, schoolId, 'GradeScale', created.id, 'created', null, created, auditCtx)
      return created
    })

    return NextResponse.json({ scale }, { status: 201 })
  } catch (error) {
    console.error('Create grade scale error:', error)
    return internalError('creating the grade scale')
  }
}
