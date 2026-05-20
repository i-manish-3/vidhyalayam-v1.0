import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

const DEFAULT_FEE_GROUP_NAME = '_DEFAULT'
const DEFAULT_FEE_GROUP_DESCRIPTION = 'Default fee group. This group is required and cannot be deleted.'

async function ensureDefaultFeeGroup(schoolId: string) {
  await db.feesGroup.upsert({
    where: {
      schoolId_name: {
        schoolId,
        name: DEFAULT_FEE_GROUP_NAME,
      },
    },
    update: {
      isActive: true,
      deletedAt: null,
      description: DEFAULT_FEE_GROUP_DESCRIPTION,
    },
    create: {
      schoolId,
      name: DEFAULT_FEE_GROUP_NAME,
      description: DEFAULT_FEE_GROUP_DESCRIPTION,
      isActive: true,
    },
  })
}

// GET /api/school/fees/groups - List fee groups with items
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    await ensureDefaultFeeGroup(user.schoolId)

    const feeGroups = await db.feesGroup.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        items: {
          include: {
            feeHead: { select: { id: true, name: true, frequency: true, headType: true, isOptional: true, isActive: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    const sortedGroups = feeGroups.sort((a, b) => {
      if (a.name === DEFAULT_FEE_GROUP_NAME) return -1
      if (b.name === DEFAULT_FEE_GROUP_NAME) return 1
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({ groups: sortedGroups })
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
    if (String(name).trim() === DEFAULT_FEE_GROUP_NAME) {
      return apiError(400, 'The _DEFAULT fee group is managed automatically and already exists.')
    }

    const selectedFeeHeadIds = Array.isArray(feeHeadIds) ? feeHeadIds : []

    if (selectedFeeHeadIds.length > 0) {
      // Verify fee heads belong to this school
      const feeHeads = await db.feesHead.findMany({
        where: {
          id: { in: selectedFeeHeadIds },
          schoolId: user.schoolId,
          deletedAt: null,
        },
      })
      if (feeHeads.length !== selectedFeeHeadIds.length) {
        return apiError(400, 'Some of the fee types you selected no longer exist. Please refresh the page and try again.')
      }
    }

    const feeGroup = await db.feesGroup.create({
      data: {
        schoolId: user.schoolId,
        name,
        description,
        ...(selectedFeeHeadIds.length > 0
          ? { items: { create: selectedFeeHeadIds.map((feeHeadId: string) => ({ feeHeadId })) } }
          : {}),
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
