import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { internalError, apiError } from '@/lib/api-errors'
import { listPayableStaff } from '@/lib/salary/staff-resolver'

// GET /api/school/salary/staff - Unified payable-staff list across teacher/staff/driver.
// Powers the staff picker and payroll-run selection. Supports ?staffType=&search=.
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'salary:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view the staff list.")
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('staffType') || undefined
    const search = searchParams.get('search') || undefined
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const staff = await listPayableStaff(db, user.schoolId, { type, search, includeInactive })

    return NextResponse.json({ staff })
  } catch (error) {
    console.error('List payable staff error:', error)
    return internalError('loading the staff list')
  }
}
