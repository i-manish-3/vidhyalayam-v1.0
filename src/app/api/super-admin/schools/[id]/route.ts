import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/super-admin/schools/[id] - Get school details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) {
      return unauthorizedError()
    }

    const { id } = await params

    const school = await db.school.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            students: { where: { deletedAt: null } },
            teachers: { where: { deletedAt: null } },
            classes: { where: { isActive: true } },
            users: { where: { deletedAt: null } },
          },
        },
        users: {
          where: { role: 'SCHOOL_ADMIN', deletedAt: null },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            lastLoginAt: true,
            accountLockout: {
              select: {
                lockedUntil: true,
                failedAttempts: true,
              },
            },
          },
        },
      },
    })

    if (!school) {
      return apiError(404, 'We couldn\'t find this school. It may have been removed.')
    }

    return NextResponse.json({
      id: school.id,
      name: school.name,
      logo: school.logo,
      address: school.address,
      city: school.city,
      state: school.state,
      pincode: school.pincode,
      country: school.country,
      contactPhone: school.contactPhone,
      contactEmail: school.contactEmail,
      website: school.website,
      academicYear: school.academicYear,
      board: school.board,
      timezone: school.timezone,
      currency: school.currency,
      subdomain: school.subdomain,
      status: school.status,
      trialEndsAt: school.trialEndsAt,
      onboardingDate: school.onboardingDate,
      favicon: school.favicon,
      primaryColor: school.primaryColor,
      features: school.features,
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
      studentCount: school._count.students,
      teacherCount: school._count.teachers,
      classCount: school._count.classes,
      userCount: school._count.users,
      admin: school.users[0]
        ? (() => {
            const a = school.users[0]
            const lockedUntil = a.accountLockout?.lockedUntil ?? null
            const isLocked = !!(lockedUntil && lockedUntil > new Date())
            return {
              id: a.id,
              name: a.name,
              email: a.email,
              phone: a.phone,
              lastLoginAt: a.lastLoginAt,
              isLocked,
              lockedUntil,
              failedAttempts: a.accountLockout?.failedAttempts ?? 0,
            }
          })()
        : null,
    })
  } catch (error) {
    console.error('Get school error:', error)
    return internalError('fetching school details')
  }
}

// PATCH /api/super-admin/schools/[id] - Update school
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) {
      return unauthorizedError()
    }

    const { id } = await params
    const body = await request.json()

    const school = await db.school.findUnique({ where: { id } })
    if (!school) {
      return apiError(404, 'We couldn\'t find this school. It may have been removed.')
    }

    const {
      name,
      address,
      city,
      state,
      pincode,
      country,
      contactPhone,
      contactEmail,
      website,
      board,
      academicYear,
      status,
      primaryColor,
      features,
      timezone,
      currency,
    } = body

    // Validate status transitions
    if (status && !['pending', 'active', 'suspended', 'trial'].includes(status)) {
      return apiError(400, 'Please select a valid status: Pending, Active, Suspended, or Trial.')
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (address !== undefined) updateData.address = address
    if (city !== undefined) updateData.city = city
    if (state !== undefined) updateData.state = state
    if (pincode !== undefined) updateData.pincode = pincode
    if (country !== undefined) updateData.country = country
    if (contactPhone !== undefined) updateData.contactPhone = contactPhone
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail
    if (website !== undefined) updateData.website = website
    if (board !== undefined) updateData.board = board
    if (academicYear !== undefined) updateData.academicYear = academicYear
    if (status !== undefined) {
      updateData.status = status
      // Clear trialEndsAt when moving off trial; keep existing trialEndsAt when staying on trial
      if (status !== 'trial') {
        updateData.trialEndsAt = null
      } else if (body.trialDays !== undefined) {
        const td = Number(body.trialDays)
        if (Number.isFinite(td) && td >= 1 && td <= 365) {
          updateData.trialEndsAt = new Date(Date.now() + Math.floor(td) * 24 * 60 * 60 * 1000)
        }
      }
    }
    if (primaryColor !== undefined) updateData.primaryColor = primaryColor
    if (features !== undefined) updateData.features = features
    if (timezone !== undefined) updateData.timezone = timezone
    if (currency !== undefined) updateData.currency = currency

    const updatedSchool = await db.school.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      id: updatedSchool.id,
      name: updatedSchool.name,
      status: updatedSchool.status,
      updatedAt: updatedSchool.updatedAt,
    })
  } catch (error) {
    console.error('Update school error:', error)
    return internalError('updating the school')
  }
}

// DELETE /api/super-admin/schools/[id] - Delete school (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) {
      return unauthorizedError()
    }

    const { id } = await params

    const school = await db.school.findUnique({ where: { id } })
    if (!school) {
      return apiError(404, 'We couldn\'t find this school. It may have been removed.')
    }

    // Soft delete the school and its users
    await db.$transaction([
      db.user.updateMany({
        where: { schoolId: id },
        data: { deletedAt: new Date(), isActive: false },
      }),
      db.school.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'suspended' },
      }),
    ])

    return NextResponse.json({
      message: `${school.name} has been deleted successfully.`,
      id,
    })
  } catch (error) {
    console.error('Delete school error:', error)
    return internalError('deleting the school')
  }
}
