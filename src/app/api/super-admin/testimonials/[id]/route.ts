import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError, internalError } from '@/lib/api-errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const testimonial = await db.testimonial.findFirst({
      where: { id, deletedAt: null },
    })

    if (!testimonial) {
      return apiError(404, 'We couldn\'t find this testimonial. It may have been removed.')
    }

    return NextResponse.json({ testimonial })
  } catch (error) {
    console.error('Fetch testimonial error:', error)
    return internalError('loading the testimonial')
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, role, quote, stars, avatarUrl, isActive, sortOrder } = body

    const existing = await db.testimonial.findFirst({
      where: { id, deletedAt: null },
    })

    if (!existing) {
      return apiError(404, 'We couldn\'t find this testimonial. It may have been removed.')
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (role !== undefined) updateData.role = role
    if (quote !== undefined) updateData.quote = quote
    if (stars !== undefined) updateData.stars = stars
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl
    if (isActive !== undefined) updateData.isActive = isActive
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder

    const testimonial = await db.testimonial.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ testimonial })
  } catch (error) {
    console.error('Update testimonial error:', error)
    return internalError('saving the testimonial')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.testimonial.findFirst({
      where: { id, deletedAt: null },
    })

    if (!existing) {
      return apiError(404, 'We couldn\'t find this testimonial. It may have been removed.')
    }

    const testimonial = await db.testimonial.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ testimonial })
  } catch (error) {
    console.error('Delete testimonial error:', error)
    return internalError('deleting the testimonial')
  }
}
