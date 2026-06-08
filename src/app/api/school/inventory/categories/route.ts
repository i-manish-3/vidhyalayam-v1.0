import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

function optionalText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}

// GET /api/school/inventory/categories - list with item counts
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const categories = await db.inventoryCategory.findMany({
      where: { schoolId: user.schoolId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    })
    return NextResponse.json({ categories })
  } catch (error) {
    console.error('List categories error:', error)
    return internalError('listing categories')
  }
}

// POST /api/school/inventory/categories - create
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'inventory:create')
    if (!user || !user.schoolId) return unauthorizedError()
    const body = await request.json()
    const name = optionalText(body.name)
    if (!name) return apiError(400, 'Please enter a category name.')

    const dup = await db.inventoryCategory.findFirst({
      where: { schoolId: user.schoolId, name, deletedAt: null },
      select: { id: true },
    })
    if (dup) return apiError(400, `A category named "${name}" already exists.`)

    const category = await db.inventoryCategory.create({
      data: { schoolId: user.schoolId, name, description: optionalText(body.description), isActive: true },
    })
    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    console.error('Create category error:', error)
    return internalError('creating the category')
  }
}
