import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'
import { sanitizeTemplateHtml } from '@/lib/id-card-sanitize'
import { CERTIFICATE_TYPE_VALUES } from '@/features/certificates/lib/certificate-types'

const MAX_BODY_LENGTH = 50_000

async function findTemplate(schoolId: string, id: string) {
  return db.certificateTemplate.findFirst({
    where: { id, schoolId, deletedAt: null },
  })
}

// GET /api/school/certificates/templates/[id] — single template
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'certificate:read')
    if (!user?.schoolId) return unauthorizedError()
    const { id } = await params

    const template = await findTemplate(user.schoolId, id)
    if (!template) return apiError(404, 'Certificate template not found')

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Get certificate template error:', error)
    return internalError('loading certificate template')
  }
}

// PATCH /api/school/certificates/templates/[id] — update a template
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'certificate:template:manage')
    if (!user?.schoolId) return apiError(403, "You don't have permission to edit certificate templates.")
    const { id } = await params

    const template = await findTemplate(user.schoolId, id)
    if (!template) return apiError(404, 'Certificate template not found')

    const body = await request.json().catch(() => ({}))
    const data: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return apiError(422, 'Template name is required.')
      data.name = name
    }
    if (body.type !== undefined) {
      const type = typeof body.type === 'string' ? body.type : ''
      if (!CERTIFICATE_TYPE_VALUES.includes(type)) {
        return apiError(422, 'Please select a valid certificate type.')
      }
      data.type = type
    }
    if (body.numberPrefix !== undefined) {
      const prefix = typeof body.numberPrefix === 'string' ? body.numberPrefix.trim() : ''
      data.numberPrefix = prefix || 'CERT'
    }
    if (body.description !== undefined) {
      data.description = typeof body.description === 'string' ? body.description.trim() || null : null
    }
    if (body.bodyHtml !== undefined) {
      const bodyHtml = typeof body.bodyHtml === 'string' ? body.bodyHtml.trim() : ''
      if (!bodyHtml) return apiError(422, 'Certificate body is required.')
      if (bodyHtml.length > MAX_BODY_LENGTH) {
        return apiError(422, `Certificate body is too long (max ${MAX_BODY_LENGTH} characters).`)
      }
      data.bodyHtml = sanitizeTemplateHtml(bodyHtml).html
    }
    if (body.isDefault !== undefined) data.isDefault = body.isDefault === true
    if (body.isActive !== undefined) data.isActive = body.isActive !== false

    const result = await db.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.certificateTemplate.updateMany({
          where: { schoolId: user.schoolId!, deletedAt: null, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        })
      }
      return tx.certificateTemplate.update({ where: { id }, data })
    })

    return NextResponse.json({ template: result })
  } catch (error) {
    console.error('Update certificate template error:', error)
    return internalError('updating certificate template')
  }
}

// DELETE /api/school/certificates/templates/[id] — soft-delete a template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'certificate:template:manage')
    if (!user?.schoolId) return apiError(403, "You don't have permission to delete certificate templates.")
    const { id } = await params

    const template = await findTemplate(user.schoolId, id)
    if (!template) return apiError(404, 'Certificate template not found')

    await db.certificateTemplate.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete certificate template error:', error)
    return internalError('deleting certificate template')
  }
}