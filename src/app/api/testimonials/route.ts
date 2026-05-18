// Public testimonials API for landing page
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { internalError } from '@/lib/api-errors'

export async function GET() {
  try {
    const testimonials = await db.testimonial.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json({ testimonials })
  } catch (error) {
    console.error('Fetch public testimonials error:', error)
    return internalError('loading testimonials')
  }
}
