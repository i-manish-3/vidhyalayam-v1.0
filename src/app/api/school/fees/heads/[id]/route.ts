import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

const VALID_FREQUENCIES = ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM', 'INSTALLMENT', 'ON_DEMAND']
const VALID_HEAD_TYPES = ['STANDARD', 'REFUNDABLE_DEPOSIT', 'NON_REFUNDABLE']

// PATCH /api/school/fees/heads/[id] - Update a fee head
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'fees:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to update fee heads.")
    }

    const { id } = await params
    const body = await request.json()
    const { name, frequency, headType, isOptional, isActive, applicability } = body

    const existing = await db.feesHead.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) {
      return notFoundError('FeeHead')
    }

    if (name !== undefined && !String(name).trim()) {
      return apiError(400, 'Please enter the fee head name.')
    }

    if (frequency !== undefined && !VALID_FREQUENCIES.includes(frequency)) {
      return apiError(400, 'The frequency you selected is not valid. Please choose from the supported billing behaviours.')
    }

    if (headType !== undefined && !VALID_HEAD_TYPES.includes(headType)) {
      return apiError(400, 'Please choose a valid fee head type.')
    }

    const trimmedName = name !== undefined ? String(name).trim() : undefined
    if (trimmedName && trimmedName !== existing.name) {
      const duplicate = await db.feesHead.findFirst({
        where: {
          schoolId: user.schoolId,
          name: trimmedName,
          deletedAt: null,
          id: { not: id },
        },
      })
      if (duplicate) {
        return apiError(400, `A fee head named "${trimmedName}" already exists. Please use a different name.`)
      }
    }

    const updateData: Record<string, unknown> = {}
    if (trimmedName !== undefined) updateData.name = trimmedName
    if (frequency !== undefined) updateData.frequency = frequency
    if (headType !== undefined) updateData.headType = headType
    if (isOptional !== undefined) updateData.isOptional = Boolean(isOptional)
    if (isActive !== undefined) updateData.isActive = Boolean(isActive)
    if (applicability !== undefined) {
      updateData.applicability = applicability ? JSON.stringify(applicability) : null
    }

    const feeHead = await db.feesHead.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      head: feeHead,
      message: 'Fee head has been updated successfully.',
    })
  } catch (error) {
    console.error('Update fee head error:', error)
    return internalError('updating the fee head')
  }
}
