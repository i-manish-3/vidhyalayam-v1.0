import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'
import { db } from '@/lib/db'
import { previewEmployeeId } from '@/lib/employee-numbering'

// GET /api/school/employees/next-number - Preview the next employee ID.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    const employeeId = await previewEmployeeId(db, user.schoolId)
    return NextResponse.json({ employeeId })
  } catch (error) {
    console.error('Preview next employee ID error:', error)
    return internalError('previewing next employee ID')
  }
}
