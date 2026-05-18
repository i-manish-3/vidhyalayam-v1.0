// Public pricing API for landing page
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { internalError } from '@/lib/api-errors'

export async function GET() {
  try {
    const [plans, addons] = await Promise.all([
      db.pricingPlan.findMany({
        where: {
          isActive: true,
          deletedAt: null,
        },
        orderBy: { sortOrder: 'asc' },
      }),
      db.pricingAddon.findMany({
        where: {
          isActive: true,
          deletedAt: null,
        },
        orderBy: { sortOrder: 'asc' },
      }),
    ])

    return NextResponse.json({ plans, addons })
  } catch (error) {
    console.error('Fetch public pricing error:', error)
    return internalError('loading pricing information')
  }
}
