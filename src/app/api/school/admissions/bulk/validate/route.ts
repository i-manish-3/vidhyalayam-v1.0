import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { validateRow, type RawRow, type RowDiagnostic } from '@/lib/bulk-admission'
import { loadBulkAdmissionLookups } from '@/lib/bulk-admission-lookups'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/
const MAX_ROWS_PER_REQUEST = 1000

async function resolveActiveAcademicYear(schoolId: string): Promise<string | null> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const year = (school?.academicYear || '').trim()
  if (!ACADEMIC_YEAR_PATTERN.test(year)) return null
  const exists = await db.academicYear.findFirst({
    where: { schoolId, name: year, isActive: true, deletedAt: null },
    select: { id: true },
  })
  return exists ? year : null
}

export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:create')
      if (!authorized) {
        return forbiddenError("You don't have permission to bulk-admit students.")
      }
    }

    const body = await request.json().catch(() => null)
    const rows: RawRow[] = Array.isArray(body?.rows) ? body.rows : []

    if (rows.length === 0) {
      return apiError(400, 'No rows received. Please upload a CSV with at least one row.')
    }
    if (rows.length > MAX_ROWS_PER_REQUEST) {
      return apiError(400, `Too many rows. Please split the file into uploads of ${MAX_ROWS_PER_REQUEST} rows or fewer.`)
    }

    const academicYear = await resolveActiveAcademicYear(user.schoolId)
    if (!academicYear) {
      return apiError(400, 'No active academic year is configured for this school. Please activate one before bulk-admitting students.')
    }

    const lookups = await loadBulkAdmissionLookups(user.schoolId, academicYear)

    const seenOverrides = new Set<string>()
    const diagnostics: RowDiagnostic[] = rows.map((row, index) =>
      validateRow({ row, index, lookups, seenOverrides }),
    )

    const counts = diagnostics.reduce(
      (acc, d) => {
        acc[d.status] += 1
        return acc
      },
      { valid: 0, warning: 0, invalid: 0 } as Record<'valid' | 'warning' | 'invalid', number>,
    )

    return NextResponse.json({
      academicYear,
      counts,
      diagnostics,
    })
  } catch (error) {
    console.error('Bulk admission validate error:', error)
    return internalError('validating the upload')
  }
}
