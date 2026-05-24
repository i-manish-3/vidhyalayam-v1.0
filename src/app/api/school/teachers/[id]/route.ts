import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'
import { uploadIfDataUrl, IMAGE_MIME_TYPES } from '@/lib/storage'

// PATCH /api/school/teachers/[id] - Update teacher
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params
    const body = await request.json()

    // Verify teacher belongs to this school
    const teacher = await db.teacher.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!teacher) {
      return apiError(404, 'We couldn\'t find this teacher\'s record. It may have been removed.')
    }

    const {
      firstName,
      lastName,
      employeeId,
      dateOfBirth,
      gender,
      address,
      city,
      state,
      pincode,
      aadhaarNumber,
      qualification,
      specialization,
      experience,
      joinDate,
      profileImage,
      isActive,
    } = body

    const updateData: Record<string, unknown> = {}
    if (firstName !== undefined) updateData.firstName = firstName
    if (lastName !== undefined) updateData.lastName = lastName
    if (employeeId !== undefined) updateData.employeeId = employeeId
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null
    if (gender !== undefined) updateData.gender = gender
    if (address !== undefined) updateData.address = address
    if (city !== undefined) updateData.city = city
    if (state !== undefined) updateData.state = state
    if (pincode !== undefined) updateData.pincode = pincode
    if (aadhaarNumber !== undefined) updateData.aadhaarNumber = aadhaarNumber
    if (qualification !== undefined) updateData.qualification = qualification
    if (specialization !== undefined) updateData.specialization = specialization
    if (experience !== undefined) updateData.experience = experience
    if (joinDate !== undefined) updateData.joinDate = joinDate ? new Date(joinDate) : null
    if (profileImage !== undefined) {
      const upload = await uploadIfDataUrl(profileImage, {
        folder: `schools/${user.schoolId}/teachers`,
        maxBytes: 2 * 1024 * 1024,
        allowedMimeTypes: IMAGE_MIME_TYPES,
        previousUrl: teacher.profileImage,
      })
      if (upload.error) {
        return apiError(400, `Profile image: ${upload.error}`)
      }
      updateData.profileImage = upload.url
    }
    if (isActive !== undefined) updateData.isActive = isActive

    const updated = await db.teacher.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update teacher error:', error)
    return internalError('updating the teacher record')
  }
}
