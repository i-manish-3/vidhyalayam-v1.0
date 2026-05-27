import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'
import { uploadIfDataUrl, IMAGE_MIME_TYPES } from '@/lib/storage'

// GET /api/school/teachers/[id] - Get one teacher for editing
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params
    const teacher = await db.teacher.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!teacher) {
      return notFoundError('Teacher')
    }

    const linkedUser = teacher.userId
      ? await db.user.findFirst({
          where: { id: teacher.userId, schoolId: user.schoolId, deletedAt: null },
          select: { phone: true, email: true, isActive: true },
        })
      : null

    return NextResponse.json({
      ...teacher,
      phone: linkedUser?.phone ?? null,
      email: linkedUser?.email ?? null,
      isActive: teacher.isActive && (linkedUser?.isActive ?? true),
      fullName: `${teacher.firstName} ${teacher.lastName}`,
    })
  } catch (error) {
    console.error('Get teacher error:', error)
    return internalError('loading the teacher record')
  }
}

// PATCH /api/school/teachers/[id] - Update teacher
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'teacher:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to update teachers.")
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
      phone,
      email,
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

    const userUpdateData: Record<string, unknown> = {}
    if (firstName !== undefined || lastName !== undefined) {
      userUpdateData.name = `${firstName ?? teacher.firstName} ${lastName ?? teacher.lastName}`.trim()
    }
    if (profileImage !== undefined) {
      userUpdateData.avatar = updateData.profileImage ?? null
    }
    if (isActive !== undefined) {
      userUpdateData.isActive = isActive
    }
    if (phone !== undefined) {
      const normalizedPhone = String(phone).replace(/\D/g, '').slice(-10)
      if (normalizedPhone.length !== 10) {
        return apiError(400, 'Please enter a valid 10-digit phone number.')
      }
      const existingPhoneUser = await db.user.findFirst({
        where: {
          phone: normalizedPhone,
          deletedAt: null,
          ...(teacher.userId ? { id: { not: teacher.userId } } : {}),
        },
        select: { id: true },
      })
      if (existingPhoneUser) {
        return apiError(400, 'A user with this phone number already exists. Please use a different phone number.')
      }
      userUpdateData.phone = normalizedPhone
    }
    if (email !== undefined) {
      const trimmedEmail = typeof email === 'string' ? email.trim() : ''
      if (trimmedEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
          return apiError(400, 'Please enter a valid email address.')
        }
        const existingEmailUser = await db.user.findFirst({
          where: {
            email: trimmedEmail,
            deletedAt: null,
            ...(teacher.userId ? { id: { not: teacher.userId } } : {}),
          },
          select: { id: true },
        })
        if (existingEmailUser) {
          return apiError(400, 'A user with this email already exists. Please use a different email address.')
        }
        userUpdateData.email = trimmedEmail
      }
    }

    const updated = await db.$transaction(async (tx) => {
      const updatedTeacher = Object.keys(updateData).length > 0
        ? await tx.teacher.update({
            where: { id },
            data: updateData,
          })
        : teacher

      if (teacher.userId && Object.keys(userUpdateData).length > 0) {
        await tx.user.update({
          where: { id: teacher.userId },
          data: userUpdateData,
        })
      }

      return updatedTeacher
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update teacher error:', error)
    return internalError('updating the teacher record')
  }
}
