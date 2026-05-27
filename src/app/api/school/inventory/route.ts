import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/inventory - List items
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { supplier: { contains: search } },
        { location: { contains: search } },
      ]
    }
    if (category) where.category = category

    const [items, total] = await Promise.all([
      db.inventoryItem.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      db.inventoryItem.count({ where }),
    ])

    return NextResponse.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List inventory error:', error)
    return internalError('listing inventory')
  }
}

// POST /api/school/inventory - Add item
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'inventory:create')
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const {
      name,
      category,
      quantity,
      unit,
      unitPrice,
      totalPrice,
      supplier,
      purchaseDate,
      condition,
      location,
    } = body

    if (!name) {
      return apiError(400, 'Please enter a name for this inventory item.')
    }

    const item = await db.inventoryItem.create({
      data: {
        schoolId: user.schoolId,
        name,
        category,
        quantity: quantity || 0,
        unit,
        unitPrice,
        totalPrice: totalPrice || (unitPrice && quantity ? unitPrice * quantity : null),
        supplier,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        condition,
        location,
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('Add inventory item error:', error)
    return internalError('adding the inventory item')
  }
}
