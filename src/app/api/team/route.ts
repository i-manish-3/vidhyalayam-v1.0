// Public team API for landing page
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { internalError } from '@/lib/api-errors'

export async function GET() {
  try {
    const members = await db.teamMember.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json({ members })
  } catch (error) {
    console.error('Fetch public team error:', error)
    return internalError('loading our team')
  }
}
