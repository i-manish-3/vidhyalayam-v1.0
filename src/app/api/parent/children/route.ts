import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

// GET /api/parent/children - Get children for the logged-in parent
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['PARENT'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    // Find parent records linked to this user
    const parentRecords = await db.parent.findMany({
      where: { userId: user.userId, schoolId: user.schoolId },
      select: { id: true },
    })

    if (parentRecords.length === 0) {
      return NextResponse.json({ children: [] })
    }

    const parentIds = parentRecords.map(p => p.id)

    // Find all student-parent links
    const studentLinks = await db.studentParent.findMany({
      where: { parentId: { in: parentIds } },
      select: { studentId: true },
    })

    const studentIds = studentLinks.map(sl => sl.studentId)

    if (studentIds.length === 0) {
      return NextResponse.json({ children: [] })
    }

    // Fetch student details (including isActive so parent can see disabled students)
    const students = await db.student.findMany({
      where: { id: { in: studentIds }, deletedAt: null },
      select: {
        id: true,
        admissionNumber: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        dateOfBirth: true,
        gender: true,
        bloodGroup: true,
        category: true,
        religion: true,
        nationality: true,
        motherTongue: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        admissionDate: true,
        profileImage: true,
        admissionStatus: true,
        isActive: true,
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        admission: {
          select: {
            academicYear: true,
            status: true,
            fatherName: true,
            fatherPhone: true,
            motherName: true,
            motherPhone: true,
          },
        },
      },
    })

    const addressParts = (s: { address: string | null; city: string | null; state: string | null; pincode: string | null }) =>
      [s.address, s.city, s.state, s.pincode].filter(Boolean).join(', ') || null

    const children = students.map(s => ({
      id: s.id,
      admissionNumber: s.admissionNumber,
      firstName: s.firstName,
      lastName: s.lastName,
      fullName: `${s.firstName} ${s.lastName}`,
      rollNumber: s.rollNumber,
      dateOfBirth: s.dateOfBirth,
      gender: s.gender,
      bloodGroup: s.bloodGroup,
      category: s.category,
      religion: s.religion,
      nationality: s.nationality,
      motherTongue: s.motherTongue,
      address: addressParts(s),
      admissionDate: s.admissionDate,
      profileImage: s.profileImage,
      admissionStatus: s.admissionStatus,
      isActive: s.isActive,
      className: s.class?.name || null,
      sectionName: s.section?.name || null,
      academicYear: s.admission?.academicYear || null,
      fatherName: s.admission?.fatherName || null,
      fatherPhone: s.admission?.fatherPhone || null,
      motherName: s.admission?.motherName || null,
      motherPhone: s.admission?.motherPhone || null,
    }))

    return NextResponse.json({ children })
  } catch (error) {
    console.error('Get parent children error:', error)
    return internalError("loading your children's records")
  }
}
