import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'
import { sanitizeTemplateHtml } from '@/lib/id-card-sanitize'
import { CERTIFICATE_TYPE_VALUES } from '@/features/certificates/lib/certificate-types'

const MAX_BODY_LENGTH = 50_000

// GET /api/school/certificates/templates — list certificate templates for the tenant
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'certificate:read')
    if (!user?.schoolId) return unauthorizedError()

    const templates = await db.certificateTemplate.findMany({
      where: { schoolId: user.schoolId, deletedAt: null },
      orderBy: [{ type: 'asc' }, { isDefault: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        type: true,
        name: true,
        description: true,
        numberPrefix: true,
        bodyHtml: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('List certificate templates error:', error)
    return internalError('loading certificate templates')
  }
}

// POST /api/school/certificates/templates — create a new certificate template
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'certificate:template:manage')
    if (!user?.schoolId) return apiError(403, "You don't have permission to create certificate templates.")

    const body = await request.json().catch(() => ({}))
    const type = typeof body.type === 'string' ? body.type : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const numberPrefix = typeof body.numberPrefix === 'string' ? body.numberPrefix.trim() : ''
    const bodyHtml = typeof body.bodyHtml === 'string' ? body.bodyHtml.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''

    if (!CERTIFICATE_TYPE_VALUES.includes(type)) {
      return apiError(422, 'Please select a valid certificate type.')
    }
    if (!name) return apiError(422, 'Template name is required.')
    if (!bodyHtml) return apiError(422, 'Certificate body is required.')
    if (bodyHtml.length > MAX_BODY_LENGTH) {
      return apiError(422, `Certificate body is too long (max ${MAX_BODY_LENGTH} characters).`)
    }
    const prefix = numberPrefix || 'CERT'

    // Strip dangerous markup — templates render inside the app + print pages.
    const clean = sanitizeTemplateHtml(bodyHtml)
    const isDefault = body.isDefault === true
    const isActive = body.isActive !== false

    const result = await db.$transaction(async (tx) => {
      if (isDefault) {
        await tx.certificateTemplate.updateMany({
          where: { schoolId: user.schoolId!, deletedAt: null, isDefault: true },
          data: { isDefault: false },
        })
      }
      return tx.certificateTemplate.create({
        data: {
          schoolId: user.schoolId!,
          type,
          name,
          description: description || null,
          numberPrefix: prefix,
          bodyHtml: clean.html,
          isDefault,
          isActive,
          createdBy: user.userId,
        },
      })
    })

    return NextResponse.json({ template: result }, { status: 201 })
  } catch (error) {
    console.error('Create certificate template error:', error)
    return internalError('creating certificate template')
  }
}