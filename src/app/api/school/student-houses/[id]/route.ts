import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

function cleanOptionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || null
}

function cleanColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const color = value.trim()
  return HEX_COLOR.test(color) ? color : undefined
}

// PATCH /api/school/student-houses/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'student:update')
      if (!authorized) return forbiddenError("You don't have permission to manage student houses.")
    }

    const { id } = await params
    const body = await request.json()
    const house = await db.studentHouse.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!house) return apiError(404, 'House not found.')

    const data: Record<string, unknown> = {}
    const name = cleanOptionalText(body.name)
    if (name !== undefined) {
      if (!name) return apiError(400, 'House name is required.')
      data.name = name
    }
    const color = cleanColor(body.color)
    if (color !== undefined) data.color = color
    const description = cleanOptionalText(body.description)
    if (description !== undefined) data.description = description
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive

    const updated = await db.studentHouse.update({
      where: { id },
      data,
    })
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError(409, 'A house with this name already exists.')
    }
    console.error('Update student house error:', error)
    return internalError('updating the student house')
  }
}

// DELETE /api/school/student-houses/[id] - Soft delete only when no students are assigned
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'student:update')
      if (!authorized) return forbiddenError("You don't have permission to manage student houses.")
    }

    const { id } = await params
    const house = await db.studentHouse.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!house) return apiError(404, 'House not found.')

    const assignedCount = await db.student.count({
      where: { schoolId: user.schoolId, houseId: id, deletedAt: null },
    })
    if (assignedCount > 0) {
      return apiError(409, `This house is assigned to ${assignedCount} student${assignedCount === 1 ? '' : 's'}. Unassign them before deleting the house.`)
    }

    await db.$transaction(async (tx) => {
      await tx.studentHouse.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      })
    })

    return NextResponse.json({ message: 'House deleted.' })
  } catch (error) {
    console.error('Delete student house error:', error)
    return internalError('deleting the student house')
  }
}
