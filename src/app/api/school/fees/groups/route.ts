import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/fees/groups - List fee groups with items
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const feeGroups = await db.feesGroup.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        items: {
          include: {
            feeHead: { select: { id: true, name: true, frequency: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ groups: feeGroups })
  } catch (error) {
    console.error('List fee groups error:', error)
    return internalError('listing fee groups')
  }
}

// POST /api/school/fees/groups - Create fee group
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { name, description, feeHeadIds } = body

    if (!name) {
      return apiError(400, 'Please enter a name for the fee group.')
    }

    if (!feeHeadIds || !Array.isArray(feeHeadIds) || feeHeadIds.length === 0) {
      return apiError(400, 'Please select at least one fee type to include in this group.')
    }

    // Verify fee heads belong to this school
    const feeHeads = await db.feesHead.findMany({
      where: {
        id: { in: feeHeadIds },
        schoolId: user.schoolId,
        deletedAt: null,
      },
    })
    if (feeHeads.length !== feeHeadIds.length) {
      return apiError(400, 'Some of the fee types you selected no longer exist. Please refresh the page and try again.')
    }

    const feeGroup = await db.feesGroup.create({
      data: {
        schoolId: user.schoolId,
        name,
        description,
        items: {
          create: feeHeadIds.map((feeHeadId: string) => ({ feeHeadId })),
        },
      },
      include: {
        items: {
          include: {
            feeHead: true,
          },
        },
      },
    })

    return NextResponse.json(feeGroup, { status: 201 })
  } catch (error) {
    console.error('Create fee group error:', error)
    return internalError('creating the fee group')
  }
}
