import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/students/[id]/parent-details
// Returns parent details for a given student, used to auto-fill sibling admission form
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params

    // 1. Get the student with class info
    const student = await db.student.findFirst({
      where: {
        id,
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        class: {
          select: { name: true },
        },
        admission: true,
        parentLinks: {
          include: {
            parent: true,
          },
        },
      },
    })

    if (!student) {
      return apiError(404, 'We couldn\'t find this student\'s record. It may have been removed.')
    }

    // 2. Get the admission record for detailed parent fields
    const admission = student.admission

    // 3. Build parent info from parentLinks
    const fatherLink = student.parentLinks.find(
      (link) => link.relation === 'Father'
    )
    const motherLink = student.parentLinks.find(
      (link) => link.relation === 'Mother'
    )

    const fatherParent = fatherLink?.parent
    const motherParent = motherLink?.parent

    // 4. Build response — Admission fields preferred for detailed info,
    //    Parent record used as fallback
    const response = {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNumber: student.admissionNumber,
        class: student.class ? { name: student.class.name } : null,
        address: student.address,
        city: student.city,
        state: student.state,
        pincode: student.pincode,
        country: student.country,
      },
      father: {
        name: admission?.fatherName ?? fatherParent?.fatherName ?? null,
        phone: admission?.fatherPhone ?? fatherParent?.phone ?? null,
        email: admission?.fatherEmail ?? fatherParent?.email ?? null,
        occupation: admission?.fatherOccupation ?? fatherParent?.occupation ?? null,
        aadhaar: admission?.fatherAadhaar ?? null,
        education: admission?.fatherEducation ?? null,
        income: admission?.fatherIncome ?? fatherParent?.annualIncome ?? null,
      },
      mother: {
        name: admission?.motherName ?? motherParent?.motherName ?? null,
        phone: admission?.motherPhone ?? motherParent?.phone ?? null,
        email: admission?.motherEmail ?? motherParent?.email ?? null,
        occupation: admission?.motherOccupation ?? motherParent?.occupation ?? null,
        aadhaar: admission?.motherAadhaar ?? null,
        education: admission?.motherEducation ?? null,
        income: admission?.motherIncome ?? motherParent?.annualIncome ?? null,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Get parent details error:', error)
    return internalError('loading parent details')
  }
}
