import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { uploadIfDataUrl, IMAGE_MIME_TYPES } from '@/lib/storage'
import { employeeIdExists, normalizeEmployeeId, resolveEmployeeId } from '@/lib/employee-numbering'

const DEFAULT_TEACHER_PASSWORD = 'teacher123'
const TEACHER_ROLE_NAME = 'Teacher'

function localTeacherEmail(phone: string, schoolId: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10)
  return `teacher.${schoolId.slice(0, 8)}.${digits || Date.now()}@teacher.local`
}

// GET /api/school/teachers - List teachers
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { employeeId: { contains: search } },
        { specialization: { contains: search } },
      ]
    }

    const [teachers, total] = await Promise.all([
      db.teacher.findMany({
        where,
        include: {
          salaryStructure: {
            select: { id: true, grossSalary: true, netSalary: true },
          },
        },
        orderBy: [{ firstName: 'asc' }],
        skip,
        take: limit,
      }),
      db.teacher.count({ where }),
    ])
    const userIds = teachers.map((teacher) => teacher.userId).filter(Boolean) as string[]
    const linkedUsers = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, phone: true, email: true, isActive: true },
        })
      : []
    const userById = new Map(linkedUsers.map((linkedUser) => [linkedUser.id, linkedUser]))

    return NextResponse.json({
      teachers: teachers.map((t) => {
        const linkedUser = t.userId ? userById.get(t.userId) : null
        return {
          ...t,
          phone: linkedUser?.phone ?? null,
          email: linkedUser?.email ?? null,
          isActive: t.isActive && (linkedUser?.isActive ?? true),
          fullName: `${t.firstName} ${t.lastName}`,
        }
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List teachers error:', error)
    return internalError('loading teachers')
  }
}

// POST /api/school/teachers - Create teacher
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
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
      email,
      phone,
    } = body

    if (!firstName || !lastName) {
      return apiError(400, 'Please enter the teacher\'s first name and last name.')
    }

    const requestedEmployeeId = normalizeEmployeeId(employeeId)
    if (requestedEmployeeId && await employeeIdExists(db, user.schoolId, requestedEmployeeId)) {
      return apiError(400, `Employee ID "${requestedEmployeeId}" is already in use.`)
    }

    const normalizedPhone = typeof phone === 'string' ? phone.replace(/\D/g, '').slice(-10) : ''
    if (normalizedPhone.length !== 10) {
      return apiError(400, 'Please enter a valid 10-digit phone number for the teacher login account.')
    }

    const trimmedEmail = typeof email === 'string' ? email.trim() : ''
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return apiError(400, 'Please enter a valid email address.')
    }

    let finalEmail = trimmedEmail
    if (!finalEmail) finalEmail = localTeacherEmail(normalizedPhone, user.schoolId)

    const [existingByEmail, existingByPhone] = await Promise.all([
      db.user.findUnique({ where: { email: finalEmail } }),
      db.user.findFirst({ where: { phone: normalizedPhone, deletedAt: null } }),
    ])
    if (existingByEmail) {
      return apiError(400, 'A user with this email already exists. Please use a different email address.')
    }
    if (existingByPhone) {
      return apiError(400, 'A user with this phone number already exists. Please use a different phone number.')
    }

    const photoUpload = await uploadIfDataUrl(profileImage, {
      folder: `schools/${user.schoolId}/teachers`,
      maxBytes: 2 * 1024 * 1024,
      allowedMimeTypes: IMAGE_MIME_TYPES,
    })
    if (photoUpload.error) {
      return apiError(400, `Profile image: ${photoUpload.error}`)
    }

    const hashedPwd = await hashPassword(DEFAULT_TEACHER_PASSWORD)

    const teacher = await db.$transaction(async (tx) => {
      const finalEmployeeId = await resolveEmployeeId(tx, user.schoolId!, employeeId)
      const createdUser = await tx.user.create({
        data: {
          employeeId: finalEmployeeId,
          email: finalEmail,
          password: hashedPwd,
          name: `${firstName} ${lastName}`.trim(),
          phone: normalizedPhone,
          avatar: photoUpload.url ?? null,
          role: 'TEACHER',
          schoolId: user.schoolId,
          mustChangePassword: true,
        },
      })

      const teacherRole = await tx.role.upsert({
        where: {
          schoolId_name: {
            schoolId: user.schoolId!,
            name: TEACHER_ROLE_NAME,
          },
        },
        update: {
          description: 'Default teaching staff role',
          color: 'violet',
          isSystem: true,
          isActive: true,
          deletedAt: null,
        },
        create: {
          schoolId: user.schoolId!,
          name: TEACHER_ROLE_NAME,
          description: 'Default teaching staff role',
          color: 'violet',
          isSystem: true,
          isActive: true,
        },
      })

      await tx.userRole.create({
        data: {
          userId: createdUser.id,
          roleId: teacherRole.id,
          assignedBy: user.userId,
        },
      })

      return tx.teacher.create({
        data: {
          schoolId: user.schoolId!,
          userId: createdUser.id,
          employeeId: finalEmployeeId,
          firstName,
          lastName,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          gender,
          address,
          city,
          state,
          pincode,
          aadhaarNumber,
          qualification,
          specialization,
          experience: experience || 0,
          joinDate: joinDate ? new Date(joinDate) : new Date(),
          profileImage: photoUpload.url ?? null,
        },
      })
    })

    return NextResponse.json(teacher, { status: 201 })
  } catch (error) {
    console.error('Create teacher error:', error)
    return internalError('creating the teacher record')
  }
}
