import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth'
import { apiError, forbiddenError, internalError, unauthorizedError } from '@/lib/api-errors'
import { assignUserToRoleByName } from '@/lib/rbac'

const DEFAULT_DRIVER_PASSWORD = 'driver123'

function localDriverEmail(phone: string, schoolId: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10)
  return `driver.${schoolId.slice(0, 8)}.${digits || Date.now()}@driver.local`
}

function isValidPhoto(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
}

function isUnderOneMbBase64Image(value: string): boolean {
  const base64 = value.split(',')[1] || ''
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  const bytes = Math.floor((base64.length * 3) / 4) - padding
  return bytes < 1024 * 1024
}

// GET /api/school/transport/drivers - List users assigned to the Transport role.
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

    const drivers = await db.user.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        isActive: true,
        userRoles: {
          some: {
            role: {
              schoolId: user.schoolId,
              name: 'Transport',
              deletedAt: null,
              isActive: true,
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        avatar: true,
        dob: true,
        drivingLicenseNumber: true,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ drivers })
  } catch (error) {
    console.error('List transport drivers error:', error)
    return internalError('listing transport drivers')
  }
}

// POST /api/school/transport/drivers - Create a Transport-role driver account.
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
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const dob = typeof body.dob === 'string' ? body.dob.trim() : ''
    const drivingLicenseNumber = typeof body.drivingLicenseNumber === 'string' ? body.drivingLicenseNumber.trim().toUpperCase() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const photo = body.photo

    if (!name || !dob || !drivingLicenseNumber || !phone) {
      return apiError(400, 'Please enter driver name, DOB, driving license number, and phone number.')
    }

    const parsedDob = new Date(dob)
    if (Number.isNaN(parsedDob.getTime())) {
      return apiError(400, 'Please enter a valid date of birth.')
    }

    if (photo !== undefined && photo !== null && photo !== '' && !isValidPhoto(photo)) {
      return apiError(400, 'Please upload a valid JPG, PNG, or WebP driver photo.')
    }
    if (isValidPhoto(photo) && !isUnderOneMbBase64Image(photo)) {
      return apiError(400, 'Please upload a driver photo smaller than 1MB.')
    }

    const existingPhone = await db.user.findFirst({
      where: {
        schoolId: user.schoolId,
        phone,
        deletedAt: null,
      },
    })
    if (existingPhone) {
      return apiError(400, 'A user with this phone number already exists.')
    }

    const existingLicense = await db.user.findFirst({
      where: {
        schoolId: user.schoolId,
        drivingLicenseNumber,
        deletedAt: null,
      },
    })
    if (existingLicense) {
      return apiError(400, 'A driver with this driving license number already exists.')
    }

    const defaultPassword = DEFAULT_DRIVER_PASSWORD
    const hashedPassword = await hashPassword(defaultPassword)
    let email = localDriverEmail(phone, user.schoolId)
    const existingEmail = await db.user.findUnique({ where: { email } })
    if (existingEmail) {
      email = `driver.${user.schoolId.slice(0, 8)}.${Date.now()}@driver.local`
    }

    const driver = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          schoolId: user.schoolId!,
          name,
          email,
          password: hashedPassword,
          phone,
          avatar: isValidPhoto(photo) ? photo : null,
          dob: parsedDob,
          drivingLicenseNumber,
          mustChangePassword: true,
          role: 'STAFF',
          isActive: true,
        },
      })

      await assignUserToRoleByName(newUser.id, user.schoolId!, 'Transport', user.userId, tx)

      return newUser
    })

    return NextResponse.json(
      {
        id: driver.id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        dob: driver.dob,
        drivingLicenseNumber: driver.drivingLicenseNumber,
        message: `"${driver.name}" has been added as a transport driver.`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create transport driver error:', error)
    return internalError('creating the transport driver')
  }
}
