import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'

// GET /api/school/fees/structures - List fee structures with items
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

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId') || ''
    const academicYear = searchParams.get('academicYear') || ''
    const feesGroupId = searchParams.get('feesGroupId') || ''

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }
    if (classId) where.classId = classId
    if (academicYear) where.academicYear = academicYear
    if (feesGroupId) where.feesGroupId = feesGroupId

    const feeStructures = await db.feesStructure.findMany({
      where,
      include: {
        feesGroup: {
          select: { id: true, name: true },
        },
        class: {
          select: { id: true, name: true },
        },
        section: {
          select: { id: true, name: true },
        },
        items: {
          include: {
            feeHead: {
              select: { id: true, name: true, frequency: true, headType: true, isOptional: true },
            },
          },
          orderBy: { installmentName: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ structures: feeStructures })
  } catch (error) {
    console.error('List fee structures error:', error)
    return internalError('listing fee structures')
  }
}

// POST /api/school/fees/structures - Create fee structure with installment items
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'fees:create')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to create fee structures.")
    }

    const body = await request.json()
    const {
      name,
      feeGroupId,
      feesGroupId,
      classId,
      sectionId,
      academicYear,
      effectiveFrom,
      effectiveTo,
      version,
      replaceExisting,
      items,
    } = body

    // Accept both feeGroupId and feesGroupId
    const resolvedFeeGroupId = feeGroupId || feesGroupId

    if (!name || !resolvedFeeGroupId || !classId || !academicYear) {
      return apiError(400, 'Please fill in the structure name, fee group, class, and academic year.')
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return apiError(400, 'Please add at least one fee installment to this structure.')
    }

    // Verify fees group belongs to this school
    const feesGroup = await db.feesGroup.findFirst({
      where: { id: resolvedFeeGroupId, schoolId: user.schoolId, deletedAt: null },
      include: { items: { include: { feeHead: true } } },
    })
    if (!feesGroup) {
      return apiError(400, 'The fee group you selected doesn\'t exist anymore. It may have been removed. Please refresh and try again.')
    }

    // Verify class belongs to this school
    const classRecord = await db.class.findFirst({
      where: { id: classId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!classRecord) {
      return apiError(400, 'The class you selected doesn\'t exist anymore. It may have been removed. Please refresh and try again.')
    }

    const normalizedSectionId = sectionId && sectionId !== 'ALL' ? sectionId : null
    const latestStructure = await db.feesStructure.findFirst({
      where: {
        schoolId: user.schoolId,
        feesGroupId: resolvedFeeGroupId,
        classId,
        sectionId: normalizedSectionId,
        academicYear,
        deletedAt: null,
      },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    const resolvedVersion = Number.isFinite(Number(version)) && Number(version) > 0
      ? Number(version)
      : (latestStructure?.version || 0) + 1

    if (replaceExisting) {
      await db.feesStructure.updateMany({
        where: {
          schoolId: user.schoolId,
          feesGroupId: resolvedFeeGroupId,
          classId,
          sectionId: normalizedSectionId,
          academicYear,
          deletedAt: null,
          status: 'active',
        },
        data: {
          status: 'archived',
          isActive: false,
        },
      })
    }

    const feeStructure = await db.feesStructure.create({
      data: {
        schoolId: user.schoolId,
        feesGroupId: resolvedFeeGroupId,
        classId,
        sectionId: normalizedSectionId,
        academicYear,
        name,
        version: resolvedVersion,
        status: 'active',
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        items: {
          create: items.map(
            (item: {
              feeHeadId: string
              installmentName?: string
              period?: string
              amount: number
              dueDate?: string
              lateFee?: number
              frequency?: string
            }) => {
              // Find the fee head to get the frequency
              const feeHeadItem = feesGroup.items?.find((gi: { feeHeadId: string; feeHead?: { frequency: string } }) => gi.feeHeadId === item.feeHeadId)
              return {
                feeHeadId: item.feeHeadId,
                installmentName: item.installmentName || item.period || 'Annual',
                amount: item.amount || 0,
                dueDate: item.dueDate ? new Date(item.dueDate) : null,
                lateFee: item.lateFee || 0,
                frequency: item.frequency || feeHeadItem?.feeHead?.frequency || 'MONTHLY',
              }
            }
          ),
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

    return NextResponse.json(feeStructure, { status: 201 })
  } catch (error) {
    console.error('Create fee structure error:', error)
    return internalError('creating the fee structure')
  }
}
