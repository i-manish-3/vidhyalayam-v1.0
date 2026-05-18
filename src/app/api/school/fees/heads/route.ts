import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/fees/heads - List fee heads
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const feeHeads = await db.feesHead.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ heads: feeHeads })
  } catch (error) {
    console.error('List fee heads error:', error)
    return internalError('listing fee heads')
  }
}

// POST /api/school/fees/heads - Create fee head
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { name, frequency } = body

    if (!name || !frequency) {
      return apiError(400, 'Please enter the fee head name and select how often it\'s charged (monthly, yearly, etc.).')
    }

    const validFrequencies = ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM']
    if (!validFrequencies.includes(frequency)) {
      return apiError(400, 'The frequency you selected isn\'t valid. Please choose from: One-time, Monthly, Quarterly, Half-yearly, Yearly, or Custom.')
    }

    const feeHead = await db.feesHead.create({
      data: {
        schoolId: user.schoolId,
        name,
        frequency,
      },
    })

    return NextResponse.json(feeHead, { status: 201 })
  } catch (error) {
    console.error('Create fee head error:', error)
    return internalError('creating the fee head')
  }
}
