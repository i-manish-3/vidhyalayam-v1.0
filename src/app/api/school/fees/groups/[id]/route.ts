import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

const DEFAULT_FEE_GROUP_NAME = '_DEFAULT'

// PATCH /api/school/fees/groups/[id] - Update a fee group
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'fees:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to update fee groups.")
    }

    const { id } = await params
    const body = await request.json()
    const { name, description, isActive } = body

    const existing = await db.feesGroup.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) {
      return notFoundError('FeesGroup')
    }
    const isDefaultGroup = existing.name === DEFAULT_FEE_GROUP_NAME

    if (name !== undefined && !String(name).trim()) {
      return apiError(400, 'Please enter a name for the fee group.')
    }
    if (isDefaultGroup && name !== undefined && String(name).trim() !== DEFAULT_FEE_GROUP_NAME) {
      return apiError(400, 'The _DEFAULT fee group name cannot be changed.')
    }

    const trimmedName = name !== undefined ? String(name).trim() : undefined
    if (trimmedName && trimmedName !== existing.name) {
      const duplicate = await db.feesGroup.findFirst({
        where: {
          schoolId: user.schoolId,
          name: trimmedName,
          deletedAt: null,
          id: { not: id },
        },
      })
      if (duplicate) {
        return apiError(400, `A fee group named "${trimmedName}" already exists. Please use a different name.`)
      }
    }

    const updateData: Record<string, unknown> = {}
    if (trimmedName !== undefined) updateData.name = trimmedName
    if (description !== undefined) {
      const trimmedDescription = String(description).trim()
      updateData.description = trimmedDescription || null
    }
    if (isActive !== undefined) {
      if (isDefaultGroup && !Boolean(isActive)) {
        return apiError(400, 'The _DEFAULT fee group must stay active.')
      }
      updateData.isActive = Boolean(isActive)
    }

    const group = await db.feesGroup.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          include: {
            feeHead: true,
          },
        },
      },
    })

    return NextResponse.json({
      group,
      message: 'Fee group has been updated successfully.',
    })
  } catch (error) {
    console.error('Update fee group error:', error)
    return internalError('updating the fee group')
  }
}

// DELETE /api/school/fees/groups/[id] - Soft delete a fee group
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'fees:delete')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to delete fee groups.")
    }

    const { id } = await params

    const existing = await db.feesGroup.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: {
        _count: {
          select: {
            structures: true,
            assignments: true,
          },
        },
      },
    })
    if (!existing) {
      return notFoundError('FeesGroup')
    }
    if (existing.name === DEFAULT_FEE_GROUP_NAME) {
      return apiError(400, 'The _DEFAULT fee group is required and cannot be deleted.')
    }

    if (existing._count.structures > 0 || existing._count.assignments > 0) {
      return apiError(400, 'This fee group is already used in fee structures or student assignments, so it cannot be deleted.')
    }

    await db.feesGroup.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    })

    return NextResponse.json({
      message: `Fee group "${existing.name}" has been deleted successfully.`,
    })
  } catch (error) {
    console.error('Delete fee group error:', error)
    return internalError('deleting the fee group')
  }
}
