import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'

const VALID_TYPES = new Set(['public', 'school', 'vacation'])

function parseDate(value: unknown): Date | null {
  if (!value || typeof value !== 'string') return null
  const d = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t || null
}

// PATCH /api/school/holidays/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'holiday:manage')
    if (!user?.schoolId) return apiError(403, "You don't have permission to manage holidays.")

    const { id } = await params
    const existing = await db.holiday.findFirst({ where: { id, schoolId: user.schoolId, deletedAt: null } })
    if (!existing) return apiError(404, 'Holiday not found.')

    const body = await request.json()
    const { name, type, date, endDate, description } = body

    const cleanName = optionalText(name)
    if (name !== undefined && !cleanName) return apiError(400, 'Please enter a holiday name.')

    const cleanType = optionalText(type)
    if (cleanType && !VALID_TYPES.has(cleanType)) return apiError(400, 'Invalid holiday type.')

    const cleanDate = date !== undefined ? parseDate(date) : existing.date
    if (date !== undefined && !cleanDate) return apiError(400, 'Please enter a valid date.')

    const cleanEndDate = endDate !== undefined ? parseDate(endDate) : existing.endDate
    if (cleanEndDate && cleanDate && cleanEndDate < cleanDate) return apiError(400, 'End date must be on or after start date.')

    const holiday = await db.holiday.update({
      where: { id },
      data: {
        ...(cleanName ? { name: cleanName } : {}),
        ...(cleanType ? { type: cleanType } : {}),
        ...(cleanDate ? { date: cleanDate } : {}),
        endDate: endDate !== undefined ? cleanEndDate : undefined,
        ...(description !== undefined ? { description: optionalText(description) } : {}),
      },
    })

    return NextResponse.json({ holiday })
  } catch (error) {
    console.error('Update holiday error:', error)
    return internalError('updating holiday')
  }
}

// DELETE /api/school/holidays/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'holiday:manage')
    if (!user?.schoolId) return apiError(403, "You don't have permission to manage holidays.")

    const { id } = await params
    const existing = await db.holiday.findFirst({ where: { id, schoolId: user.schoolId, deletedAt: null } })
    if (!existing) return apiError(404, 'Holiday not found.')

    await db.holiday.update({ where: { id }, data: { deletedAt: new Date() } })

    return NextResponse.json({ message: 'Holiday deleted.' })
  } catch (error) {
    console.error('Delete holiday error:', error)
    return internalError('deleting holiday')
  }
}
