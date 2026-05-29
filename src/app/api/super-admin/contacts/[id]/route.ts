import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { internalError, unauthorizedError, forbiddenError } from '@/lib/api-errors'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getAuthUser(request)
    if (!user) return unauthorizedError()
    if (user.role !== 'SUPER_ADMIN') return forbiddenError()

    const { id } = await params
    const body = await request.json()
    const { status, notes, contactedBy } = body

    const updateData: Record<string, unknown> = {}
    if (status) updateData.status = status
    if (notes !== undefined) updateData.notes = notes
    if (contactedBy) {
      updateData.contactedBy = contactedBy
      updateData.contactedAt = new Date()
    }

    const contact = await db.contactRequest.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ contact })
  } catch (error) {
    console.error('Update contact request error:', error)
    return internalError('updating the contact request')
  }
}
