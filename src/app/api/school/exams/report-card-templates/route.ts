import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

const VALID_FORMATS = new Set(['cbse', 'simple', 'term_wise', 'grade_only', 'coaching'])

// GET /api/school/exams/report-card-templates - list templates
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const permitted = await requirePermission(request, 'exam:view')
    if (!permitted) return forbiddenError()

    const { searchParams } = new URL(request.url)
    const paradigmId = searchParams.get('paradigmId') ?? undefined
    const onlyActive = searchParams.get('active') === 'true'

    const templates = await db.reportCardTemplate.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(paradigmId ? { appliesToParadigmId: paradigmId } : {}),
        ...(onlyActive ? { isActive: true } : {}),
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('List report card templates error:', error)
    return internalError('loading report card templates')
  }
}

// POST /api/school/exams/report-card-templates - create new template
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'exam:reportcard:manage')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to manage report card templates.")
    }

    const body = await request.json().catch(() => ({}))
    const {
      name,
      description,
      format,
      appliesToParadigmId,
      layoutJson,
      includeAttendance,
      includeRank,
      includeCoScholastic,
      showPrincipalRemarks,
      showTeacherRemarks,
      isDefault,
      isActive,
      cloneFromId,
    } = body as Record<string, unknown>

    if (typeof name !== 'string' || !name.trim()) {
      return apiError(400, 'Please enter a name for this template.')
    }
    const trimmedName = name.trim()
    const resolvedFormat = typeof format === 'string' && VALID_FORMATS.has(format) ? format : 'cbse'

    // Resolve the layout — explicit body wins; otherwise clone-source; otherwise minimal default.
    let resolvedLayout: string
    let sourceTemplate: { layoutJson: string; format: string; includeAttendance: boolean; includeRank: boolean; includeCoScholastic: boolean; showPrincipalRemarks: boolean; showTeacherRemarks: boolean } | null = null
    if (typeof cloneFromId === 'string' && cloneFromId.length > 0) {
      sourceTemplate = await db.reportCardTemplate.findFirst({
        where: { id: cloneFromId, schoolId: user.schoolId, deletedAt: null },
        select: {
          layoutJson: true,
          format: true,
          includeAttendance: true,
          includeRank: true,
          includeCoScholastic: true,
          showPrincipalRemarks: true,
          showTeacherRemarks: true,
        },
      })
      if (!sourceTemplate) return apiError(404, 'Source template not found to clone from.')
    }
    if (typeof layoutJson === 'string' && layoutJson.length > 0) {
      try {
        JSON.parse(layoutJson)
      } catch {
        return apiError(400, 'Layout JSON is malformed.')
      }
      resolvedLayout = layoutJson
    } else if (sourceTemplate) {
      resolvedLayout = sourceTemplate.layoutJson
    } else {
      resolvedLayout = JSON.stringify({
        header: { showLogo: true, showAddress: true },
        studentBlock: ['name', 'admissionNumber', 'rollNumber', 'class', 'section', 'fatherName', 'motherName'],
        subjectTable: { showComponents: true, showGrade: true, showRank: false },
        footer: { showAttendance: true, showRemarks: true, signatures: ['Class Teacher', 'Principal'] },
      })
    }

    const duplicate = await db.reportCardTemplate.findFirst({
      where: { schoolId: user.schoolId, name: trimmedName, deletedAt: null },
    })
    if (duplicate) {
      return apiError(409, `A template named "${trimmedName}" already exists.`)
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const template = await db.$transaction(async (tx) => {
      if (isDefault === true) {
        await tx.reportCardTemplate.updateMany({
          where: { schoolId, isDefault: true, deletedAt: null },
          data: { isDefault: false },
        })
      }
      const created = await tx.reportCardTemplate.create({
        data: {
          schoolId,
          name: trimmedName,
          description: typeof description === 'string' ? description.trim() || null : null,
          format: sourceTemplate ? sourceTemplate.format : resolvedFormat,
          appliesToParadigmId: typeof appliesToParadigmId === 'string' && appliesToParadigmId ? appliesToParadigmId : null,
          layoutJson: resolvedLayout,
          includeAttendance: includeAttendance !== undefined ? Boolean(includeAttendance) : sourceTemplate?.includeAttendance ?? true,
          includeRank: includeRank !== undefined ? Boolean(includeRank) : sourceTemplate?.includeRank ?? true,
          includeCoScholastic: includeCoScholastic !== undefined ? Boolean(includeCoScholastic) : sourceTemplate?.includeCoScholastic ?? true,
          showPrincipalRemarks: showPrincipalRemarks !== undefined ? Boolean(showPrincipalRemarks) : sourceTemplate?.showPrincipalRemarks ?? true,
          showTeacherRemarks: showTeacherRemarks !== undefined ? Boolean(showTeacherRemarks) : sourceTemplate?.showTeacherRemarks ?? true,
          isDefault: Boolean(isDefault),
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
      })
      await logExamChange(tx, schoolId, 'ReportCardTemplate', created.id, 'created', null, created, auditCtx)
      return created
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    console.error('Create report card template error:', error)
    return internalError('creating the report card template')
  }
}
