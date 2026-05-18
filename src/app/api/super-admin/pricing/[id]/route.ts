import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError, internalError } from '@/lib/api-errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')

    if (!type || (type !== 'plan' && type !== 'addon')) {
      return apiError(400, 'Please specify whether you want to view plans or add-ons (use type=plan or type=addon).')
    }

    const item = type === 'plan'
      ? await db.pricingPlan.findFirst({
          where: { id, deletedAt: null },
        })
      : await db.pricingAddon.findFirst({
          where: { id, deletedAt: null },
        })

    if (!item) {
      return apiError(404, 'We couldn\'t find this pricing item. It may have been removed.')
    }

    return NextResponse.json({ item })
  } catch (error) {
    console.error('Fetch pricing item error:', error)
    return internalError('loading the pricing item')
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')

    if (!type || (type !== 'plan' && type !== 'addon')) {
      return apiError(400, 'Please specify whether you want to view plans or add-ons (use type=plan or type=addon).')
    }

    const body = await request.json()

    const existing = type === 'plan'
      ? await db.pricingPlan.findFirst({ where: { id, deletedAt: null } })
      : await db.pricingAddon.findFirst({ where: { id, deletedAt: null } })

    if (!existing) {
      return apiError(404, 'We couldn\'t find this pricing item. It may have been removed.')
    }

    const updateData: Record<string, unknown> = {}

    if (type === 'plan') {
      const { name, pricePerStudent, billingCycle, description, features, highlights, isActive, isPopular, sortOrder } = body
      if (name !== undefined) updateData.name = name
      if (pricePerStudent !== undefined) updateData.pricePerStudent = pricePerStudent
      if (billingCycle !== undefined) updateData.billingCycle = billingCycle
      if (description !== undefined) updateData.description = description
      if (features !== undefined) updateData.features = features
      if (highlights !== undefined) updateData.highlights = highlights
      if (isActive !== undefined) updateData.isActive = isActive
      if (isPopular !== undefined) updateData.isPopular = isPopular
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder
    } else {
      const { name, description, icon, price, priceLabel, type: addonType, isActive, sortOrder } = body
      if (name !== undefined) updateData.name = name
      if (description !== undefined) updateData.description = description
      if (icon !== undefined) updateData.icon = icon
      if (price !== undefined) updateData.price = price
      if (priceLabel !== undefined) updateData.priceLabel = priceLabel
      if (addonType !== undefined) updateData.type = addonType
      if (isActive !== undefined) updateData.isActive = isActive
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder
    }

    const item = type === 'plan'
      ? await db.pricingPlan.update({ where: { id }, data: updateData })
      : await db.pricingAddon.update({ where: { id }, data: updateData })

    return NextResponse.json({ item })
  } catch (error) {
    console.error('Update pricing item error:', error)
    return internalError('saving the pricing item')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')

    if (!type || (type !== 'plan' && type !== 'addon')) {
      return apiError(400, 'Please specify whether you want to view plans or add-ons (use type=plan or type=addon).')
    }

    const existing = type === 'plan'
      ? await db.pricingPlan.findFirst({ where: { id, deletedAt: null } })
      : await db.pricingAddon.findFirst({ where: { id, deletedAt: null } })

    if (!existing) {
      return apiError(404, 'We couldn\'t find this pricing item. It may have been removed.')
    }

    const item = type === 'plan'
      ? await db.pricingPlan.update({
          where: { id },
          data: { deletedAt: new Date() },
        })
      : await db.pricingAddon.update({
          where: { id },
          data: { deletedAt: new Date() },
        })

    return NextResponse.json({ item })
  } catch (error) {
    console.error('Delete pricing item error:', error)
    return internalError('deleting the pricing item')
  }
}
