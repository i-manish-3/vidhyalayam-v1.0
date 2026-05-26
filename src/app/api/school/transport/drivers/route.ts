import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth'
import { apiError, forbiddenError, internalError, unauthorizedError } from '@/lib/api-errors'
import { assignUserToRoleByName } from '@/lib/rbac'
import { uploadIfDataUrl, IMAGE_MIME_TYPES } from '@/lib/storage'
import { employeeIdExists, normalizeEmployeeId, resolveEmployeeId } from '@/lib/employee-numbering'

const DEFAULT_DRIVER_PASSWORD = 'driver123'

function localDriverEmail(phone: string, schoolId: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10)
  return `driver.${schoolId.slice(0, 8)}.${digits || Date.now()}@driver.local`
}

// GET /api/school/transport/drivers - List drivers from Driver table joined with linked User for login/contact info.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }
    const authorized = await requirePermission(request, 'transport:read')
    if (!authorized) {
      return forbiddenError()
    }

    const drivers = await db.driver.findMany({
      where: { schoolId: user.schoolId, deletedAt: null },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })

    const userIds = drivers.map((d) => d.userId).filter(Boolean) as string[]
    const linkedUsers = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, phone: true, email: true, avatar: true, isActive: true },
        })
      : []
    const userById = new Map(linkedUsers.map((u) => [u.id, u]))

    return NextResponse.json({
      drivers: drivers.map((d) => {
        const linked = d.userId ? userById.get(d.userId) : null
        return {
          id: d.id,
          employeeId: d.employeeId,
          firstName: d.firstName,
          lastName: d.lastName,
          name: `${d.firstName} ${d.lastName}`.trim(),
          gender: d.gender,
          phone: linked?.phone ?? null,
          email: linked?.email ?? null,
          avatar: d.profileImage ?? linked?.avatar ?? null,
          dob: d.dateOfBirth,
          joinDate: d.joinDate,
          drivingLicenseNumber: d.drivingLicenseNumber,
          isActive: d.isActive && (linked?.isActive ?? true),
        }
      }),
    })
  } catch (error) {
    console.error('List transport drivers error:', error)
    return internalError('listing transport drivers')
  }
}

// POST /api/school/transport/drivers - Create Driver profile + linked User login (Transport role).
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }
    const authorized = await requirePermission(request, 'transport:create')
    if (!authorized) {
      return forbiddenError()
    }

    const body = await request.json()
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : ''
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : ''
    const gender = typeof body.gender === 'string' ? body.gender.trim() : ''
    const dob = typeof body.dob === 'string' ? body.dob.trim() : ''
    const joinDate = typeof body.joinDate === 'string' ? body.joinDate.trim() : ''
    const emailInput = typeof body.email === 'string' ? body.email.trim() : ''
    const drivingLicenseNumber = typeof body.drivingLicenseNumber === 'string' ? body.drivingLicenseNumber.trim().toUpperCase() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const photo = body.photo
    const requestedEmployeeId = normalizeEmployeeId(body.employeeId)

    if (!firstName || !lastName || !gender || !dob || !drivingLicenseNumber || !phone) {
      return apiError(400, 'Please enter first name, last name, gender, DOB, driving license number, and phone number.')
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return apiError(400, 'Phone must be 10 digits starting with 6, 7, 8 or 9.')
    }

    const parsedDob = new Date(dob)
    if (Number.isNaN(parsedDob.getTime())) {
      return apiError(400, 'Please enter a valid date of birth.')
    }

    let parsedJoinDate: Date | null = null
    if (joinDate) {
      const candidate = new Date(joinDate)
      if (Number.isNaN(candidate.getTime())) {
        return apiError(400, 'Please enter a valid join date.')
      }
      parsedJoinDate = candidate
    }

    if (emailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
      return apiError(400, 'Please enter a valid email address.')
    }

    const photoUpload = await uploadIfDataUrl(photo, {
      folder: `schools/${user.schoolId}/drivers`,
      maxBytes: 1024 * 1024,
      allowedMimeTypes: IMAGE_MIME_TYPES,
    })
    if (photoUpload.error) {
      return apiError(400, `Driver photo: ${photoUpload.error}`)
    }

    const existingPhone = await db.user.findFirst({
      where: { schoolId: user.schoolId, phone, deletedAt: null },
    })
    if (existingPhone) {
      return apiError(400, 'A user with this phone number already exists.')
    }

    const existingLicense = await db.driver.findFirst({
      where: { schoolId: user.schoolId, drivingLicenseNumber, deletedAt: null },
    })
    if (existingLicense) {
      return apiError(400, 'A driver with this driving license number already exists.')
    }

    if (requestedEmployeeId && await employeeIdExists(db, user.schoolId, requestedEmployeeId)) {
      return apiError(400, `Employee ID "${requestedEmployeeId}" is already in use.`)
    }

    const hashedPassword = await hashPassword(DEFAULT_DRIVER_PASSWORD)
    let email = emailInput
    if (email) {
      const existingByEmail = await db.user.findUnique({ where: { email } })
      if (existingByEmail) {
        return apiError(400, 'A user with this email already exists. Please use a different email address.')
      }
    } else {
      email = localDriverEmail(phone, user.schoolId)
      const existingEmail = await db.user.findUnique({ where: { email } })
      if (existingEmail) {
        email = `driver.${user.schoolId.slice(0, 8)}.${Date.now()}@driver.local`
      }
    }

    const fullName = `${firstName} ${lastName}`.trim()

    const driver = await db.$transaction(async (tx) => {
      const finalEmployeeId = await resolveEmployeeId(tx, user.schoolId!, requestedEmployeeId)
      const newUser = await tx.user.create({
        data: {
          employeeId: finalEmployeeId,
          schoolId: user.schoolId!,
          name: fullName,
          email,
          password: hashedPassword,
          phone,
          avatar: photoUpload.url ?? null,
          mustChangePassword: true,
          role: 'STAFF',
          isActive: true,
        },
      })

      await assignUserToRoleByName(newUser.id, user.schoolId!, 'Transport', user.userId, tx)

      return tx.driver.create({
        data: {
          schoolId: user.schoolId!,
          userId: newUser.id,
          employeeId: finalEmployeeId,
          firstName,
          lastName,
          gender,
          dateOfBirth: parsedDob,
          drivingLicenseNumber,
          joinDate: parsedJoinDate,
          profileImage: photoUpload.url ?? null,
        },
      })
    })

    return NextResponse.json(
      {
        id: driver.id,
        employeeId: driver.employeeId,
        firstName: driver.firstName,
        lastName: driver.lastName,
        name: fullName,
        gender: driver.gender,
        email,
        phone,
        dob: driver.dateOfBirth,
        joinDate: driver.joinDate,
        drivingLicenseNumber: driver.drivingLicenseNumber,
        message: `"${fullName}" has been added as a transport driver.`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create transport driver error:', error)
    return internalError('creating the transport driver')
  }
}
