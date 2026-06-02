import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'
import { templateInputSchema } from '@/lib/id-card-types'
import { sanitizeTemplateHtml, sanitizeTemplateCss } from '@/lib/id-card-sanitize'

// GET /api/school/id-cards/templates  — list active templates for the tenant
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    const templates = await db.idCardTemplate.findMany({
      where: { schoolId: user.schoolId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        description: true,
        templateMode: true,
        orientation: true,
        widthMm: true,
        heightMm: true,
        backgroundColor: true,
        hasBackSide: true,
        isDefault: true,
        isActive: true,
        frontHtml: true,
        frontCss: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('List id-card templates error:', error)
    return internalError('loading ID card templates')
  }
}

// POST /api/school/id-cards/templates  — create a new template
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'idcard:template:create')
    if (!user?.schoolId) return apiError(403, "You don't have permission to create ID card templates.")

    const body = await request.json()
    const parsed = templateInputSchema.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return apiError(422, first?.message || 'Some fields are invalid. Please review the highlighted fields.')
    }
    const data = parsed.data

    // HTML mode must include a front design. Element mode can be empty.
    if (data.templateMode === 'html' && !data.frontHtml?.trim()) {
      return apiError(422, 'HTML templates must include a front design.')
    }

    const frontHtmlClean = sanitizeTemplateHtml(data.frontHtml).html
    const frontCssClean = sanitizeTemplateCss(data.frontCss).html
    const backHtmlClean = data.hasBackSide ? sanitizeTemplateHtml(data.backHtml).html : null
    const backCssClean = data.hasBackSide ? sanitizeTemplateCss(data.backCss).html : null

    const result = await db.$transaction(async (tx) => {
      if (data.isDefault) {
        // Only one default per tenant.
        await tx.idCardTemplate.updateMany({
          where: { schoolId: user.schoolId!, deletedAt: null, isDefault: true },
          data: { isDefault: false },
        })
      }
      return tx.idCardTemplate.create({
        data: {
          schoolId: user.schoolId!,
          name: data.name.trim(),
          description: data.description?.trim() || null,
          templateMode: data.templateMode,
          orientation: data.orientation,
          widthMm: data.widthMm,
          heightMm: data.heightMm,
          backgroundColor: data.backgroundColor,
          frontBackground: data.frontBackground || null,
          backBackground: data.hasBackSide ? data.backBackground || null : null,
          frontLayout: JSON.stringify(data.frontLayout),
          backLayout: data.hasBackSide && data.backLayout ? JSON.stringify(data.backLayout) : null,
          frontHtml: frontHtmlClean || null,
          backHtml: backHtmlClean,
          frontCss: frontCssClean || null,
          backCss: backCssClean,
          hasBackSide: data.hasBackSide,
          isDefault: data.isDefault,
          isActive: data.isActive,
          createdBy: user.userId,
        },
      })
    })

    return NextResponse.json({ template: result }, { status: 201 })
  } catch (error) {
    console.error('Create id-card template error:', error)
    return internalError('creating ID card template')
  }
}
