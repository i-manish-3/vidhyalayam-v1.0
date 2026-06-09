import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// PATCH /api/school/notification-templates/[id] - update a school-owned template
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'notification:template:manage')
    if (!user || !user.schoolId) return unauthorizedError()
    const { id } = await params

    const existing = await db.notificationTemplate.findUnique({ where: { id } })
    if (!existing) return apiError(404, 'Template not found.')
    // System templates (schoolId null) cannot be edited by a school — they create an override via POST instead.
    if (existing.schoolId !== user.schoolId) {
      return apiError(403, 'You can only edit your own templates. Create an override instead.')
    }

    const body = await request.json()
    const { title, body: messageBody, isActive } = body

    const template = await db.notificationTemplate.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(messageBody !== undefined ? { body: messageBody } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    })
    return NextResponse.json(template)
  } catch (error) {
    console.error('Update template error:', error)
    return internalError('updating the notification template')
  }
}

// DELETE /api/school/notification-templates/[id] - remove a school override
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'notification:template:manage')
    if (!user || !user.schoolId) return unauthorizedError()
    const { id } = await params

    const existing = await db.notificationTemplate.findUnique({ where: { id } })
    if (!existing) return apiError(404, 'Template not found.')
    if (existing.schoolId !== user.schoolId) {
      return apiError(403, 'You can only delete your own templates.')
    }

    await db.notificationTemplate.delete({ where: { id } })
    return NextResponse.json({ success: true, message: 'Template deleted' })
  } catch (error) {
    console.error('Delete template error:', error)
    return internalError('deleting the notification template')
  }
}
