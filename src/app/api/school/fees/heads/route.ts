import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'

// GET /api/school/fees/heads - List fee heads
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }
    const permitted = await requirePermission(request, 'fees:read')
    if (!permitted) {
      return forbiddenError()
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
    const user = await requirePermission(request, 'fees:create')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to create fee heads.")
    }

    const body = await request.json()
    const { name, frequency, headType, isOptional, isActive, applicability } = body

    if (!name || !frequency) {
      return apiError(400, 'Please enter the fee head name and select how often it\'s charged (monthly, yearly, etc.).')
    }

    const validFrequencies = ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM', 'INSTALLMENT', 'ON_DEMAND']
    if (!validFrequencies.includes(frequency)) {
      return apiError(400, 'The frequency you selected isn\'t valid. Please choose from the supported billing behaviours.')
    }

    const validHeadTypes = ['STANDARD', 'REFUNDABLE_DEPOSIT', 'NON_REFUNDABLE']
    const resolvedHeadType = headType || 'STANDARD'
    if (!validHeadTypes.includes(resolvedHeadType)) {
      return apiError(400, 'Please choose a valid fee head type.')
    }

    const feeHead = await db.feesHead.create({
      data: {
        schoolId: user.schoolId,
        name: name.trim(),
        frequency,
        headType: resolvedHeadType,
        isOptional: Boolean(isOptional),
        isActive: isActive === undefined ? true : Boolean(isActive),
        applicability: applicability ? JSON.stringify(applicability) : null,
      },
    })

    return NextResponse.json(feeHead, { status: 201 })
  } catch (error) {
    console.error('Create fee head error:', error)
    return internalError('creating the fee head')
  }
}
