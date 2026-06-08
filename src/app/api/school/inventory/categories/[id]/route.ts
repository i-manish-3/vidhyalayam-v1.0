import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, notFoundError } from '@/lib/api-errors'

function optionalText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}

// PATCH /api/school/inventory/categories/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'inventory:update')
    if (!user || !user.schoolId) return unauthorizedError()
    const { id } = await params
    const body = await request.json()

    const existing = await db.inventoryCategory.findFirst({ where: { id, schoolId: user.schoolId, deletedAt: null } })
    if (!existing) return notFoundError('InventoryCategory')

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = optionalText(body.name)
      if (!name) return apiError(400, 'Name cannot be empty.')
      const dup = await db.inventoryCategory.findFirst({ where: { schoolId: user.schoolId, name, deletedAt: null, id: { not: id } }, select: { id: true } })
      if (dup) return apiError(400, `A category named "${name}" already exists.`)
      data.name = name
    }
    if (body.description !== undefined) data.description = optionalText(body.description)
    if (body.isActive !== undefined) data.isActive = !!body.isActive

    const updated = await db.inventoryCategory.update({ where: { id }, data })
    return NextResponse.json({ category: updated, message: 'Category updated.' })
  } catch (error) {
    console.error('Update category error:', error)
    return internalError('updating the category')
  }
}

// DELETE /api/school/inventory/categories/[id] - blocked if items still use it
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'inventory:delete')
    if (!user || !user.schoolId) return unauthorizedError()
    const { id } = await params

    const existing = await db.inventoryCategory.findFirst({ where: { id, schoolId: user.schoolId, deletedAt: null } })
    if (!existing) return notFoundError('InventoryCategory')

    const inUse = await db.inventoryItem.count({ where: { categoryId: id, deletedAt: null } })
    if (inUse > 0) return apiError(400, `Cannot delete — ${inUse} item(s) still use this category. Reassign them first.`)

    await db.inventoryCategory.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
    return NextResponse.json({ message: `Category "${existing.name}" deleted.` })
  } catch (error) {
    console.error('Delete category error:', error)
    return internalError('deleting the category')
  }
}
