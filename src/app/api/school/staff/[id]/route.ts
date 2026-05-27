import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, internalError, notFoundError, unauthorizedError } from '@/lib/api-errors'
import { uploadIfDataUrl, IMAGE_MIME_TYPES } from '@/lib/storage'

// GET /api/school/staff/[id] - Fetch staff profile with linked User contact info + roles.
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
    const staff = await db.staff.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!staff) {
      return notFoundError('Staff')
    }

    const linkedUser = staff.userId
      ? await db.user.findFirst({
          where: { id: staff.userId, deletedAt: null },
          select: {
            id: true,
            phone: true,
            email: true,
            avatar: true,
            isActive: true,
            userRoles: {
              select: {
                role: { select: { id: true, name: true, color: true } },
              },
            },
          },
        })
      : null

    return NextResponse.json({
      id: staff.id,
      userId: staff.userId,
      employeeId: staff.employeeId,
      firstName: staff.firstName,
      lastName: staff.lastName,
      fullName: `${staff.firstName} ${staff.lastName}`.trim(),
      name: `${staff.firstName} ${staff.lastName}`.trim(),
      gender: staff.gender,
      dateOfBirth: staff.dateOfBirth,
      joinDate: staff.joinDate,
      designation: staff.designation,
      department: staff.department,
      qualification: staff.qualification,
      experience: staff.experience,
      address: staff.address,
      city: staff.city,
      state: staff.state,
      pincode: staff.pincode,
      aadhaarNumber: staff.aadhaarNumber,
      profileImage: staff.profileImage,
      isActive: staff.isActive && (linkedUser?.isActive ?? true),
      phone: linkedUser?.phone ?? null,
      email: linkedUser?.email ?? null,
      assignedRoles: linkedUser?.userRoles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
        color: ur.role.color,
      })) ?? [],
    })
  } catch (error) {
    console.error('Get staff error:', error)
    return internalError('loading the staff record')
  }
}

// PATCH /api/school/staff/[id] - Update staff fields (including isActive toggle).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'role:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to update staff accounts.")
    }

    const { id } = await params
    const body = await request.json()

    const staff = await db.staff.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!staff) {
      return notFoundError('Staff')
    }

    const {
      firstName,
      lastName,
      gender,
      dateOfBirth,
      joinDate,
      designation,
      department,
      qualification,
      experience,
      address,
      city,
      state,
      pincode,
      aadhaarNumber,
      profileImage,
      isActive,
      phone,
      email,
    } = body

    const updateData: Record<string, unknown> = {}
    if (firstName !== undefined) updateData.firstName = firstName
    if (lastName !== undefined) updateData.lastName = lastName
    if (gender !== undefined) updateData.gender = gender
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null
    if (joinDate !== undefined) updateData.joinDate = joinDate ? new Date(joinDate) : null
    if (designation !== undefined) updateData.designation = designation
    if (department !== undefined) updateData.department = department
    if (qualification !== undefined) updateData.qualification = qualification
    if (experience !== undefined) updateData.experience = experience
    if (address !== undefined) updateData.address = address
    if (city !== undefined) updateData.city = city
    if (state !== undefined) updateData.state = state
    if (pincode !== undefined) updateData.pincode = pincode
    if (aadhaarNumber !== undefined) updateData.aadhaarNumber = aadhaarNumber
    if (profileImage !== undefined) {
      const upload = await uploadIfDataUrl(profileImage, {
        folder: `schools/${user.schoolId}/staff`,
        maxBytes: 1024 * 1024,
        allowedMimeTypes: IMAGE_MIME_TYPES,
        previousUrl: staff.profileImage,
      })
      if (upload.error) {
        return apiError(400, `Profile image: ${upload.error}`)
      }
      updateData.profileImage = upload.url
    }
    if (isActive !== undefined) updateData.isActive = isActive

    const userUpdateData: Record<string, unknown> = {}
    if (firstName !== undefined || lastName !== undefined) {
      userUpdateData.name = `${firstName ?? staff.firstName} ${lastName ?? staff.lastName}`.trim()
    }
    if (profileImage !== undefined) {
      userUpdateData.avatar = updateData.profileImage ?? null
    }
    if (isActive !== undefined) userUpdateData.isActive = isActive

    if (phone !== undefined) {
      const normalized = String(phone).replace(/\D/g, '').slice(-10)
      if (!/^[6-9]\d{9}$/.test(normalized)) {
        return apiError(400, 'Phone must be 10 digits starting with 6, 7, 8 or 9.')
      }
      const existing = await db.user.findFirst({
        where: {
          phone: normalized,
          deletedAt: null,
          ...(staff.userId ? { id: { not: staff.userId } } : {}),
        },
        select: { id: true },
      })
      if (existing) {
        return apiError(400, 'A user with this phone number already exists.')
      }
      userUpdateData.phone = normalized
    }

    if (email !== undefined) {
      const trimmed = typeof email === 'string' ? email.trim() : ''
      if (trimmed) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return apiError(400, 'Please enter a valid email address.')
        }
        const existing = await db.user.findFirst({
          where: {
            email: trimmed,
            deletedAt: null,
            ...(staff.userId ? { id: { not: staff.userId } } : {}),
          },
          select: { id: true },
        })
        if (existing) {
          return apiError(400, 'A user with this email already exists.')
        }
        userUpdateData.email = trimmed
      }
    }

    const updated = await db.$transaction(async (tx) => {
      const updatedStaff = Object.keys(updateData).length > 0
        ? await tx.staff.update({
            where: { id },
            data: updateData,
          })
        : staff

      if (staff.userId && Object.keys(userUpdateData).length > 0) {
        await tx.user.update({
          where: { id: staff.userId },
          data: userUpdateData,
        })
      }

      return updatedStaff
    })

    return NextResponse.json({
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      isActive: updated.isActive,
    })
  } catch (error) {
    console.error('Update staff error:', error)
    return internalError('updating the staff member')
  }
}
