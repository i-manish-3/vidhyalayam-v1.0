import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError, validationError, internalError } from '@/lib/api-errors'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')
    const search = searchParams.get('search')

    if (!type || (type !== 'plan' && type !== 'addon')) {
      return apiError(400, 'Please specify whether you want to view plans or add-ons (use type=plan or type=addon).')
    }

    const where: Record<string, unknown> = {
      deletedAt: null,
    }

    if (search) {
      where.name = { contains: search }
    }

    if (type === 'plan') {
      const [items, total] = await Promise.all([
        db.pricingPlan.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        }),
        db.pricingPlan.count({ where }),
      ])

      return NextResponse.json({ items, total })
    } else {
      const [items, total] = await Promise.all([
        db.pricingAddon.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        }),
        db.pricingAddon.count({ where }),
      ])

      return NextResponse.json({ items, total })
    }
  } catch (error) {
    console.error('Fetch pricing error:', error)
    return internalError('loading pricing')
  }
}

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')

    if (!type || (type !== 'plan' && type !== 'addon')) {
      return apiError(400, 'Please specify whether you want to view plans or add-ons (use type=plan or type=addon).')
    }

    const body = await request.json()

    if (type === 'plan') {
      const { name, features, pricePerStudent, billingCycle, description, highlights, isActive, isPopular, sortOrder } = body

      if (!name || !features) {
        return validationError('Please enter the plan name and list its features.')
      }

      const item = await db.pricingPlan.create({
        data: {
          name,
          features,
          pricePerStudent: pricePerStudent ?? 10,
          billingCycle: billingCycle ?? 'monthly',
          description: description ?? null,
          highlights: highlights ?? null,
          isActive: isActive ?? true,
          isPopular: isPopular ?? false,
          sortOrder: sortOrder ?? 0,
        },
      })

      return NextResponse.json({ item }, { status: 201 })
    } else {
      const { name, description, icon, price, priceLabel, type: addonType, isActive, sortOrder } = body

      if (!name || !description || !icon || price === undefined || !priceLabel) {
        return validationError('Please fill in the add-on name, description, icon, price, and price label.')
      }

      const item = await db.pricingAddon.create({
        data: {
          name,
          description,
          icon,
          price,
          priceLabel,
          type: addonType ?? 'one_time',
          isActive: isActive ?? true,
          sortOrder: sortOrder ?? 0,
        },
      })

      return NextResponse.json({ item }, { status: 201 })
    }
  } catch (error) {
    console.error('Create pricing error:', error)
    return internalError('saving the pricing item')
  }
}
