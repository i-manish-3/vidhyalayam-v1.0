import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, forbiddenError } from '@/lib/api-errors'
import { previewAdmissionNumbers } from '@/lib/admission-numbering'

// GET /api/school/admissions/next-number - Preview the next admission number
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    // Check admission:read permission for non-SUPER_ADMIN
    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:read')
      if (!authorized) {
        return forbiddenError("You don't have access to the Admissions section. Please contact your school administrator.")
      }
    }

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId') || undefined

    const preview = await previewAdmissionNumbers(user.schoolId, classId)

    return NextResponse.json(preview)
  } catch (error) {
    console.error('Preview next admission number error:', error)
    return internalError('previewing next admission number')
  }
}
