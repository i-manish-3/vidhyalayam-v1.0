import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/
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

// GET /api/school/holidays?academicYear=2025-2026
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF', 'STUDENT', 'PARENT'])
    if (!user?.schoolId) return unauthorizedError()

    const { searchParams } = new URL(request.url)
    const academicYear = searchParams.get('academicYear')?.trim()

    const [holidays, school] = await Promise.all([
      db.holiday.findMany({
        where: {
          schoolId: user.schoolId,
          deletedAt: null,
          ...(academicYear && ACADEMIC_YEAR_PATTERN.test(academicYear) ? { academicYear } : {}),
        },
        orderBy: { date: 'asc' },
      }),
      db.school.findUnique({
        where: { id: user.schoolId },
        select: { workingDays: true },
      }),
    ])

    let workingDays: string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    try {
      const parsed = JSON.parse(school?.workingDays || '[]')
      if (Array.isArray(parsed) && parsed.length > 0) workingDays = parsed
    } catch {}

    return NextResponse.json({ holidays, workingDays })
  } catch (error) {
    console.error('List holidays error:', error)
    return internalError('loading holidays')
  }
}

// POST /api/school/holidays
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'holiday:manage')
    if (!user?.schoolId) return apiError(403, "You don't have permission to manage holidays.")

    const body = await request.json()
    const { name, type, date, endDate, description, academicYear } = body

    const cleanName = optionalText(name)
    if (!cleanName) return apiError(400, 'Please enter a holiday name.')

    const cleanType = optionalText(type) ?? 'school'
    if (!VALID_TYPES.has(cleanType)) return apiError(400, 'Invalid holiday type.')

    const cleanDate = parseDate(date)
    if (!cleanDate) return apiError(400, 'Please enter a valid date.')

    const cleanEndDate = parseDate(endDate)
    if (cleanEndDate && cleanEndDate < cleanDate) return apiError(400, 'End date must be on or after start date.')

    const cleanYear = optionalText(academicYear)
    if (!cleanYear || !ACADEMIC_YEAR_PATTERN.test(cleanYear)) return apiError(400, 'Please provide a valid academic year.')

    const holiday = await db.holiday.create({
      data: {
        schoolId: user.schoolId,
        academicYear: cleanYear,
        name: cleanName,
        type: cleanType,
        date: cleanDate,
        endDate: cleanEndDate,
        description: optionalText(description),
      },
    })

    return NextResponse.json({ holiday }, { status: 201 })
  } catch (error) {
    console.error('Create holiday error:', error)
    return internalError('creating holiday')
  }
}
