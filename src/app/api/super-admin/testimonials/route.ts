import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validationError, internalError } from '@/lib/api-errors'
import { uploadIfDataUrl, IMAGE_MIME_TYPES } from '@/lib/storage'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {
      deletedAt: null,
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { role: { contains: search } },
        { quote: { contains: search } },
      ]
    }

    const [testimonials, total] = await Promise.all([
      db.testimonial.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      db.testimonial.count({ where }),
    ])

    return NextResponse.json({ testimonials, total })
  } catch (error) {
    console.error('Fetch testimonials error:', error)
    return internalError('loading testimonials')
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, role, quote, stars, avatarUrl, isActive, sortOrder } = body

    if (!name || !role || !quote) {
      return validationError("Please enter the person's name, their role, and the testimonial quote.")
    }

    const avatarUpload = await uploadIfDataUrl(avatarUrl, {
      folder: 'testimonials',
      maxBytes: 1024 * 1024,
      allowedMimeTypes: IMAGE_MIME_TYPES,
    })
    if (avatarUpload.error) {
      return validationError(`Avatar: ${avatarUpload.error}`)
    }

    const testimonial = await db.testimonial.create({
      data: {
        name,
        role,
        quote,
        stars: stars ?? 5,
        avatarUrl: avatarUpload.url ?? null,
        isActive: isActive ?? true,
        sortOrder: sortOrder ?? 0,
      },
    })

    return NextResponse.json({ testimonial }, { status: 201 })
  } catch (error) {
    console.error('Create testimonial error:', error)
    return internalError('saving the testimonial')
  }
}
