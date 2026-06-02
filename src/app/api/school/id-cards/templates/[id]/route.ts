import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, internalError, notFoundError, unauthorizedError } from '@/lib/api-errors'
import { layoutSchema, templateInputSchema } from '@/lib/id-card-types'
import { sanitizeTemplateHtml, sanitizeTemplateCss } from '@/lib/id-card-sanitize'

function parseLayout(json: string | null): unknown[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return layoutSchema.parse(parsed)
  } catch {
    return []
  }
}

// GET /api/school/id-cards/templates/[id] — fetch full template incl. layout
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()
    const { id } = await params

    const tpl = await db.idCardTemplate.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!tpl) return notFoundError('Template')

    return NextResponse.json({
      template: {
        ...tpl,
        frontLayout: parseLayout(tpl.frontLayout),
        backLayout: tpl.hasBackSide ? parseLayout(tpl.backLayout) : null,
      },
    })
  } catch (error) {
    console.error('Get id-card template error:', error)
    return internalError('loading ID card template')
  }
}

// PUT /api/school/id-cards/templates/[id] — replace template config
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'idcard:template:update')
    if (!user?.schoolId) return apiError(403, "You don't have permission to update ID card templates.")
    const { id } = await params

    const existing = await db.idCardTemplate.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!existing) return notFoundError('Template')

    const body = await request.json()
    const parsed = templateInputSchema.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return apiError(422, first?.message || 'Some fields are invalid. Please review the highlighted fields.')
    }
    const data = parsed.data

    if (data.templateMode === 'html' && !data.frontHtml?.trim()) {
      return apiError(422, 'HTML templates must include a front design.')
    }

    const frontHtmlClean = sanitizeTemplateHtml(data.frontHtml).html
    const frontCssClean = sanitizeTemplateCss(data.frontCss).html
    const backHtmlClean = data.hasBackSide ? sanitizeTemplateHtml(data.backHtml).html : null
    const backCssClean = data.hasBackSide ? sanitizeTemplateCss(data.backCss).html : null

    const updated = await db.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.idCardTemplate.updateMany({
          where: { schoolId: user.schoolId!, deletedAt: null, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        })
      }
      return tx.idCardTemplate.update({
        where: { id },
        data: {
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
        },
      })
    })

    return NextResponse.json({ template: updated })
  } catch (error) {
    console.error('Update id-card template error:', error)
    return internalError('updating ID card template')
  }
}

// DELETE /api/school/id-cards/templates/[id] — soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'idcard:template:delete')
    if (!user?.schoolId) return apiError(403, "You don't have permission to delete ID card templates.")
    const { id } = await params

    const existing = await db.idCardTemplate.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, isDefault: true },
    })
    if (!existing) return notFoundError('Template')

    await db.idCardTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, isDefault: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete id-card template error:', error)
    return internalError('deleting ID card template')
  }
}
